/**
 * 页面切换
 * 页面命名规则：
 *     1. p_xxx   表示主页面，包括 p_login, p_main
 *     2. sp_xxx  表示子页面，包括：sp_monitor, sp_report, sp_manage
 *
 * @method Transer
 *
 * @param  {string} defaultPage 系统启动时的默认页面名称
 */
// exports.Transer = function (defaultPage) {
  function Transer (defaultPage) {
    // let currentPageName = defaultPage // current page
    let currentPageName = defaultPage || 'p_login' // current page
  
    let previewPageName = null // preview page
  
    let currentSubPageName = null // under content page
    let previewSubPageName = null
  
    let animation = {
      'cube_left': {
        'out': 'cubeLeftOut',
        'in': 'cubeLeftIn'
      },
      'cube_right': {
        'out': 'cubeRightOut',
        'in': 'cubeRightIn'
      }
    }
  
    let mainpages = {
      p_login: 1,
      p_main: 2
    }
  
    let subpages = {
      sp_monitor: 0,
      sp_three: 1,
      sp_history: 2,
      sp_rate: 3,
      sp_report: 4,
      sp_manage: 5,
      sp_config: 6,
      sp_profile: 7
    }
  
    /**
     * Page transfer : from --> to
     *
     * @method trans
     *
     * @param  {string} from          current page
     * @param  {string} to            target page
     * @param  {string} animationName transition name defined in ainimation
     *
     */
    function transfer (from, to, animationName) {
      let f = document.getElementById(from)
      let t = document.getElementById(to)
  
      if (f != null && t != null) {
        // 每次动画开始前，清空上一次动画的加载在page上的class
        resetPage(f)
        resetPage(t)
  
        f.classList.add(animation[animationName].out)
        t.classList.add(animation[animationName].in)
      }
    }
  
    /**
     * Main page transfer : p_login <-> p_main
     *
     * @method pTransfer
     *
     * @param  {[type]}  to            [description]
     *
     */
    this.pTransfer = (to) => {
      // console.log('Get into pTransfer.')
      let from = currentPageName
  
      // 非 from 和 to 的 preview page 应该隐藏
      if (previewPageName && previewPageName !== from && previewPageName !== to) {
        setVisibility(previewPageName, false)
      }
  
      if (from !== to) {
        let animationName = 'cube_left'
        if (mainpages[from] < mainpages[to]) {
          animationName = 'cube_left'
        } else {
          animationName = 'cube_right'
        }
  
        previewPageName = from
        currentPageName = to
        transfer(from, to, animationName)
  
        // when the first time to get into main page, set the currentSubPageName
        if (to === 'p_main') {
          let menus = xdata.transerMenus
          currentSubPageName = menus[0] && menus[0].pageName || 'sp_monitor'
          // resetPage(document.getElementById(currentSubPageName))
          setVisibility(currentSubPageName, true)
          this.spTransfer(currentSubPageName)
          let localMap = JSON.parse(window.localStorage.getItem('map'))
          let localMapRow = JSON.parse(window.localStorage.getItem('maprow'))
          // xbus.trigger('MAP-OPEN-MONITOR', {id: xdata.metaStore.getDefaultMapID()})
          if (localMap && localMapRow) {
            let defaultMapObj = defaultMap(localMapRow)
            xbus.trigger('MAP-OPEN-MONITOR', {
              id: xdata.mapStore.getDefaultMapID(),
              map: defaultMapObj,
              row: localMapRow
            })
          } else {
            console.log(`Transer.js: Can NOT load map. localMap - ${localMap}, localMapRow: ${localMapRow}.`)
          }
        }
      }
    }
  
    this.spTransfer = (to) => {
      let from = currentSubPageName
  
      // 非 from 和 to 的 preview page 应该隐藏
      if (previewSubPageName && previewSubPageName !== from && previewSubPageName !== to) {
        setVisibility(previewSubPageName, false)
        previewSubPageName = null
      }
      if (previewPageName && previewPageName !== currentPageName) {
        setVisibility(previewPageName, false)
        previewPageName = null
      }
  
      if (from !== to) {
        let animationName = 'cube_left'
        if (subpages[from] < subpages[to]) {
          animationName = 'cube_left'
        } else {
          animationName = 'cube_right'
        }
  
        transfer(from, to, animationName)
        previewSubPageName = currentSubPageName
        currentSubPageName = to
      }
    }
  
    function setVisibility (pageName, isVisible) {
      if (pageName) {
        let page = document.getElementById(pageName)
        if (page) {
          if (isVisible) {
            page.classList.remove('node-hide')
          } else {
            if (!page.classList.contains('node-hide')) {
              page.classList.add('node-hide')
            }
          }
        }
      }
    }
  
    function resetPage (p) {
      let cl = p.classList
      p.className = cl[0]
    }

    function defaultMap (row) {
      let tiled = Number(row.judge_id) === 0 ? 'false' : true
      let layers = xdata.isCheck === 1 ? row.check_layers : row.layers
      let params = {
        'LAYERS': layers,
        'TILED': tiled
      }
      let center = [Number(row.x), Number(row.y)]
      let size = [Number(row.width), Number(row.height)]
      let url = `${row.url}/${layers}/${row.map_type}`
      let defaultMap = {
        id: row.map_id,
        type: row.map_type,
        tileWmsOpts: {
          url: url,
          params: params,
          serverType: 'geoserver'
        },
        viewOpts: {
          center: center,
          size: size,
          zoom: 16,
          maxZoom: 22,
          minZoom: 13
        }
      }
      return defaultMap
    }
  }
  
  export default Transer
  