const STORAGE_KEY = "elderMode";

const getElderMode = () => {
  try {
    return !!wx.getStorageSync(STORAGE_KEY);
  } catch (e) {
    return false;
  }
};

const setElderMode = (value) => {
  try {
    wx.setStorageSync(STORAGE_KEY, !!value);
  } catch (e) {}
};

const ElderBehavior = Behavior({
  data: { elderMode: false },
  pageLifetimes: {
    show() {
      this.setData({ elderMode: getElderMode() });
    }
  }
});

module.exports = { getElderMode, setElderMode, ElderBehavior };
