const { isAdmin } = require("../../utils/role");
const { ElderBehavior } = require("../../utils/elder");

const FAVORITE_COLLECTION = "favorite_products";

const showToast = (title) => {
  wx.showToast({
    title,
    icon: "none"
  });
};

const isPermissionDenied = (err) => {
  const message = String((err && (err.errMsg || err.message)) || "").toLowerCase();
  const code = String((err && (err.errCode || err.code)) || "").toLowerCase();
  return message.includes("permission") || message.includes("auth") || code === "401";
};

const getDb = () => {
  if (!wx.cloud) {
    showToast("\u4e91\u5f00\u53d1\u672a\u521d\u59cb\u5316");
    return null;
  }
  return wx.cloud.database();
};

const getCurrentUser = () => {
  try {
    return wx.getStorageSync("user") || null;
  } catch (err) {
    return null;
  }
};

const toPriceNumber = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return 0;
  }
  return Number(num.toFixed(2));
};

const formatAmount = (value) => toPriceNumber(value).toFixed(2);

const padTwo = (value) => String(value).padStart(2, "0");

const formatDateTime = (value) => {
  if (!value) {
    return "--";
  }

  let date = value;
  if (typeof value.toDate === "function") {
    date = value.toDate();
  } else if (value && typeof value === "object" && value.$date) {
    date = new Date(value.$date);
  } else if (!(value instanceof Date)) {
    date = new Date(value);
  }

  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "--";
  }

  return `${date.getFullYear()}-${padTwo(date.getMonth() + 1)}-${padTwo(date.getDate())} ${padTwo(
    date.getHours()
  )}:${padTwo(date.getMinutes())}`;
};

Page({
  behaviors: [ElderBehavior],
  data: {
    loadingFavorites: false,
    favoriteItems: [],
    swipedIndex: -1,
    userId: ""
  },
  onShow() {
    const user = getCurrentUser();
    if (!user || !user._id) {
      showToast("\u8bf7\u5148\u767b\u5f55");
      setTimeout(() => {
        wx.reLaunch({
          url: "/pages/auth/auth"
        });
      }, 260);
      return;
    }

    if (isAdmin(user)) {
      showToast("\u7ba1\u7406\u5458\u8d26\u53f7\u6682\u65e0\u6536\u85cf\u8bb0\u5f55");
      setTimeout(() => {
        const pages = getCurrentPages();
        if (pages.length > 1) {
          wx.navigateBack();
          return;
        }
        wx.switchTab({
          url: "/pages/wode/wode"
        });
      }, 260);
      return;
    }

    this.setData({
      userId: user._id
    });
    this.fetchFavorites(user._id);
  },
  onPullDownRefresh() {
    this.fetchFavorites(this.data.userId, () => {
      wx.stopPullDownRefresh();
    });
  },
  fetchFavorites(userId, done) {
    if (!userId) {
      if (typeof done === "function") {
        done();
      }
      return;
    }

    const db = getDb();
    if (!db) {
      if (typeof done === "function") {
        done();
      }
      return;
    }

    this.setData({
      loadingFavorites: true
    });

    db.collection(FAVORITE_COLLECTION)
      .where({ userId })
      .orderBy("updatedAt", "desc")
      .limit(200)
      .get()
      .then((res) => {
        const favoriteItems = ((res && res.data) || []).map((item) => ({
          ...item,
          priceDisplay: formatAmount(item.price),
          createdAtText: formatDateTime(item.createdAt || item.updatedAt)
        }));
        this.setData({
          favoriteItems
        });
      })
      .catch((err) => {
        if (isPermissionDenied(err)) {
          showToast("\u6570\u636e\u5e93\u6743\u9650\u4e0d\u8db3\uff0c\u8bf7\u68c0\u67e5 favorite_products \u96c6\u5408\u6743\u9650");
          return;
        }
        showToast("\u6536\u85cf\u52a0\u8f7d\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5");
      })
      .finally(() => {
        this.setData({
          loadingFavorites: false
        });
        if (typeof done === "function") {
          done();
        }
      });
  },
  onSwipeStart(e) {
    this._swipeStartX = e.changedTouches[0].clientX;
    this._swipeStartY = e.changedTouches[0].clientY;
  },
  onSwipeMove(e) {
    const dx = e.changedTouches[0].clientX - this._swipeStartX;
    const dy = e.changedTouches[0].clientY - this._swipeStartY;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 5) {
      e.preventDefault && e.preventDefault();
    }
  },
  onSwipeEnd(e) {
    const index = Number(e.currentTarget.dataset.index);
    const dx = e.changedTouches[0].clientX - this._swipeStartX;
    const dy = e.changedTouches[0].clientY - this._swipeStartY;
    if (Math.abs(dy) > Math.abs(dx) + 10) return;
    if (dx < -30) {
      this.setData({ swipedIndex: index });
    } else if (dx > 20) {
      this.setData({ swipedIndex: -1 });
    } else if (Math.abs(dx) <= 10 && Math.abs(dy) <= 10) {
      if (this.data.swipedIndex !== -1 && this.data.swipedIndex !== index) {
        this.setData({ swipedIndex: -1 });
      }
    }
  },
  onFavoriteItemTap(e) {
    const productId = e.currentTarget.dataset.productId;
    if (!productId) {
      return;
    }

    wx.navigateTo({
      url: `/pages/nongchanpin-detail/nongchanpin-detail?id=${productId}`
    });
  },
  onFavoriteRemoveTap(e) {
    const id = e.currentTarget.dataset.id;
    const index = Number(e.currentTarget.dataset.index);
    if (!id) {
      return;
    }

    const db = getDb();
    if (!db) {
      return;
    }

    db.collection(FAVORITE_COLLECTION)
      .doc(id)
      .remove()
      .then(() => {
        const favoriteItems = this.data.favoriteItems.filter((_, currentIndex) => currentIndex !== index);
        this.setData({
          favoriteItems
        });
        showToast("\u5df2\u53d6\u6d88\u6536\u85cf");
      })
      .catch((err) => {
        if (isPermissionDenied(err)) {
          showToast("\u6570\u636e\u5e93\u6743\u9650\u4e0d\u8db3\uff0c\u8bf7\u68c0\u67e5 favorite_products \u96c6\u5408\u6743\u9650");
          return;
        }
        showToast("\u53d6\u6d88\u6536\u85cf\u5931\u8d25");
      });
  }
});