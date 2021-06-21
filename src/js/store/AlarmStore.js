import { getAlarmShow } from '../utils/utils.js'
import ALARMDEF from '../../header/js/alarm_def.js'

const STATUS_ALARM_START = 0
const STATUS_ALARM_CANCEL = 100

export default class AlarmStore {
  constructor (gstore) {
    this.onAlarming = new Map()
    this.certificateAlarm = new Map()
    this.distinguishByObjtype = new Map() // 按照告警对象区分告警
    this.alarmLevel = 5 // 告警级别，默认是5，显示全部
    this.resetAlarming = new Map()
    this.updateReaders = new Map() // 解决无痕浏览分站数据未拉取下来的情况下，分站告警已推送至前端，告警图标未改变

    this.registerGlobalEventHandlers()
  }

  registerGlobalEventHandlers () {

    let self = this
    xbus.on('REPT-SHOW-RESULT', (ds) => {
      let isShowAlarm = getAlarmShow()
      if (!isShowAlarm) return
      if (ds.def.name === 'three-credentials') {
        let staffRows = ds.rows && ds.rows['credentials-maturity-staff']
        let vehicleRows = ds.rows && ds.rows['credentials-maturity-vehicle']
        let rows = staffRows && staffRows.concat(vehicleRows)
        if (rows) {
          for (let i = 0, len = rows.length; i < len; i++) {
            let row = rows[i]
            let name = row.credentials_staff_id ? row.credentials_staff_id : row.credentials_vehicle_id
            if (!self.certificateAlarm.get(name)) self.certificateAlarm.set(name, row)
            if (!self.onAlarming.get(name)) self.onAlarming.set(name, row)
          }
          let data = Array.from(self.certificateAlarm.values())
          xbus.trigger('ALARM-LIST-CHANGED', data)
        }
      }
    })

    xbus.on('ALARM-UPDATE', rows => {
      let isShowAlarm = getAlarmShow()
      this.alarmLevel = this.getAlarmLevel()
      if (!isShowAlarm || !this.alarmLevel) return

      // 发生电源AC断电通知server重新计算放电
      const powerLevels = this.getAllAcAlarms(rows.data)
      if (powerLevels.length > 0) {
        xbus.trigger('UPDATE-POWER-LEVEL', {rows: powerLevels})
      }

      this.storeAlarm(rows)
    })
  }

  // 获取电源AC断电所有告警
  getAllAcAlarms (datas) {
    const powers = xdata.metaStore.data.power_levels && Array.from(xdata.metaStore.data.power_levels.values())
    let powerLevels = []
    for (let i = 0; i < datas.length; i++) {
      const data = datas[i]
      if (data.type_id === 44) {
        const objID = parseInt(data.obj_id, 10)
        const deviceID = xdata.metaStore.data.device_power && xdata.metaStore.data.device_power.get(objID).device_id
        const levels = powers && powers.filter(item => {
          if (item.device_power_id === objID) {
            item['device_id'] = deviceID
            return item
          }
        })
        powerLevels = powerLevels.concat(levels)
      }
    }
    return powerLevels
  }

  // 告警级别默认为5，即显示全部告警；告警级别为4，不显示告警
  getAlarmLevel () {
    let settings = xdata.metaStore.dataInArray.get('setting')
    let alarm = settings && settings.find(item => item.name === 'alarm')
    let alarmLevel = alarm ? Number(alarm.value) : 5
    return alarmLevel
  }

  // 获取告警是否可见
  getByCollect (disTypeId) {
    if (disTypeId === 1 && xdata.objRange === 1) return true // 非正式可见
    if (disTypeId === 2 && xdata.objRange === 0) return true // 正式可见
    if (disTypeId === 3) return true // 全部可见
    return false
  }

  getNameIsSpecial (row) {
    let objType = row.obj_type_id
    let eventType = row.type_id
    let name = ALARMDEF[objType] && ALARMDEF[objType].icon
    if (eventType === 6) name = 'reader_communication'
    if (eventType === 33) name = 'reader_electricity'
    return name
  }

  storeDistinguishByObjtype (row) {
    let status = row.status
    let name = this.getNameIsSpecial(row)
    if (status === STATUS_ALARM_CANCEL) {
      let storeMap = this.distinguishByObjtype.get(name)
      storeMap && storeMap.delete(row.event_id)
      if (storeMap && Array.from(storeMap.values()).length <= 0) this.distinguishByObjtype.delete(name)
    } else {
      let ret = this.distinguishByObjtype.get(name)
      if (!ret) {
        ret = new Map()
        this.distinguishByObjtype.set(name, ret)
      }
      // row['cur_time'] = new Date(row.cur_time).format('yyyy-MM-dd hh:mm')
      ret.set(row.event_id, row)
    }
  }

  changeSensorState (row, type) {
    const deviceID = Number(row.obj_id)

    const msg = {
      id: deviceID,
      state: row['status'] === 0 ? 1 : 0,
      map_id: row['map_id']
    }
    xbus.trigger('MAP-UPDATE-SENSOR-STATE', msg)
  }

  changeReaderStateOnMap (row, type) {
    let readerObj = xdata.metaStore.data.reader && xdata.metaStore.data.reader.get(Number(row['obj_id']))
    if (!readerObj) {
      this.updateReaders.set(Number(row['obj_id']), row)
      return
    }
    const deviceTypeID = readerObj.device_type_id
    let msg = {
      device_id: Number(row['obj_id']),
      reader_id: Number(row['obj_id']),
      device_type: deviceTypeID,
      device_type_id: deviceTypeID,
      reader_type: 'reader',
      name: xdata.metaStore.getNameByID('reader_id', Number(row['obj_id'])),
      state: row['status'] === 0 ? 1 : 0,
      time: new Date(row['cur_time']).format('MM-dd hh:mm:ss'),
      map_id: row['map_id'],
      control: 0,
      event_type: type
    }
    xdata.deviceStore.setState(msg)
    xbus.trigger('MAP-UPDATE-READER-STATE', msg)
  }

  doAlarm (row, eventType, type, key, source) {
    let eventLevel = xdata.metaStore.data.event_level
    let levelID = eventType && eventType.get(type) && eventLevel.get(eventType.get(type).event_level_id) && eventLevel.get(eventType.get(type).event_level_id).event_level_id
    if (levelID !== this.alarmLevel && this.alarmLevel !== 5) return

    // dds账号只显示手动录入的人卡电量低和人卡电量极低告警
    if ([11, 12].includes(type) && xdata.userName === 'dds' && source !== 1) return

    if (row.status === STATUS_ALARM_CANCEL) {
      this.onAlarming.delete(key)
    } else {
      row['id'] = key // add an id to helpme record
      row['state'] = 'ALARMING' // add the msg's state
      row['event_type_id'] = row.type_id
      let obj = xdata.metaStore.getCardBindObjectInfo(row.obj_id)
      row['dept_id'] = obj && obj.dept_id
      row['name'] = obj ? obj.name : ( row.obj_type_id === 1 ? parseInt(row.cur_value, 10) :  parseInt(row.obj_id, 10))
      this.onAlarming.set(key, row)
    }
    this.storeDistinguishByObjtype(row)
  }

  doHandleCredentials (row) {
    let status = row.status
    // TODO: 资格证告警和告警合并？
    if (status === STATUS_ALARM_CANCEL) {
      let eventID = row.credentials_staff_id || row.credentials_vehicle_id
      this.certificateAlarm.delete(eventID)
      this.onAlarming.delete(eventID)
    } else if (status === STATUS_ALARM_START) {
      this.certificateAlarm.set(row.credentials_staff_id, row)
      this.onAlarming.set(row.credentials_staff_id, row)
    }
    xbus.trigger('ALARM-LIST-CHANGED')
  }

  storeAlarm (rows) {
    let datas = rows.data
    let eventType = xdata.metaStore.data.event_type
    let defaultMapID = parseInt(xdata.metaStore.defaultMapID, 10)
    for (let i = 0, len = datas.length; i < len; i++) {
      let row = datas[i]
      let key = row.event_id
      if (xdata.userName === 'dds' && type !== 24) continue
      if (row.credentials_staff_id || row.credentials_vehicle_id) {
        this.doHandleCredentials(row) // 处理资格证告警复位
        continue
      }
      let type = parseInt(row.type_id, 10)
      let objType = parseInt(row.obj_type_id, 10)
      let disTypeId = parseInt(row.dis_type_id, 10)
      let getIsShow = eventType && eventType.get(type) && eventType.get(type).is_show
      let isShow = getIsShow || 0
      let isByCollect = this.getByCollect(disTypeId)
      let source = parseInt(row.source, 10)
      let isFilter = true, isDisplay = true
      // 告警对象为卡，需要按照部门以及黑名单过滤
      if (objType === 9) {
        isFilter = xdata.metaStore.filterByDept(row.obj_id)
        isDisplay = xdata.metaStore.needDisplay(row.obj_id)
      }
      if (xdata.userName === 'dds' && type !== 24) continue

      if (isByCollect && isFilter && isDisplay && (isShow === 0 || row.status === STATUS_ALARM_CANCEL)) {
        switch (type) {
          case 24:
            xbus.trigger('HELPME-REQ', row)
            break
          case 34:
          case 35:
            xbus.trigger('GAS-REQ', row)
            break
          default:
            this.doAlarm(row, eventType, type, key, source)
            break
        }
      }

      if (isShow === 0 || row.status === STATUS_ALARM_CANCEL) {
        if (type === 8) xbus.trigger('LIGHT-WARN-UPDATE', row)
        if (type === 6 || type === 33) this.changeReaderStateOnMap(row, type)
        if (type === 49) this.changeSensorState(row, type)
      }
    }

    let alarmData = Array.from(this.onAlarming.values())
    xbus.trigger('ALARM-LIST-CHANGED', alarmData)
  }

}
