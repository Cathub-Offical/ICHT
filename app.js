App({
  onLaunch() {
    if (wx.cloud) {
      wx.cloud.init({
        env: "cloud1-4gpqc87m20dff863",
        traceUser: true
      })
    }
  }
})
