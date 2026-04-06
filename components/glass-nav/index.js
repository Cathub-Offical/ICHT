Component({
  properties: {
    title: {
      type: String,
      value: ''
    },
    showBack: {
      type: Boolean,
      value: true
    }
  },
  data: {
    statusBarHeight: 0,
    navContentHeight: 44,
    totalHeight: 44
  },
  lifetimes: {
    attached() {
      let statusBarHeight = 0
      let navContentHeight = 44

      try {
        const info = wx.getSystemInfoSync()
        statusBarHeight = info.statusBarHeight || 0
      } catch (e) {
        statusBarHeight = 0
      }

      try {
        const menu = wx.getMenuButtonBoundingClientRect()
        if (menu && menu.height) {
          navContentHeight = menu.height + (menu.top - statusBarHeight) * 2
        }
      } catch (e) {
        navContentHeight = 44
      }

      const totalHeight = statusBarHeight + navContentHeight

      let showBack = this.data.showBack
      try {
        const pages = getCurrentPages()
        if (pages && pages.length <= 1) {
          showBack = false
        }
      } catch (e) {}

      this.setData({
        statusBarHeight,
        navContentHeight,
        totalHeight,
        showBack
      })
    }
  },
  methods: {
    onBack() {
      wx.navigateBack({
        delta: 1
      })
    }
  }
})
