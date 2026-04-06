const { isAdmin } = require("../../utils/role");
const { updateCustomTabBar } = require("../../utils/tabbar");
const { ElderBehavior } = require("../../utils/elder");

const COLLECTION = "nongchanpin_products";
const FAVORITE_COLLECTION = "favorite_products";

const trimValue = (value) => String(value || "").trim();
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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
    showToast("云开发未初始化");
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

const parseDate = (value, endOfDay) => {
  if (!value) {
    return null;
  }
  const parts = value.split("-").map((part) => Number(part));
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) {
    return null;
  }
  const [year, month, day] = parts;
  return new Date(year, month - 1, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0);
};

Page({
  behaviors: [ElderBehavior],
  onPageScroll(e) {
    wx.createSelectorQuery().select('.hero-card').boundingClientRect(rect => {
      if (!rect) return;
      const navHeight = 88;
      if (rect.bottom <= navHeight) {
        if (!this.data.showAddBtn) this.setData({ showAddBtn: true });
      } else {
        if (this.data.showAddBtn) this.setData({ showAddBtn: false });
      }
    }).exec();
    // 回到顶部按钮逻辑
    if (e && typeof e.scrollTop === 'number') {
      if (e.scrollTop > 400) {
        if (!this.data.showBackTop) this.setData({ showBackTop: true });
      } else {
        if (this.data.showBackTop) this.setData({ showBackTop: false });
      }
    }
  },
  onBackTop() {
    wx.pageScrollTo({ scrollTop: 0, duration: 300 });
  },
  data: {
    showAddBtn: false,
    showBackTop: false,
    isAdmin: false,
    loading: false,
    favoriteSubmitting: false,
    favoriteMap: {},
    items: [],
    filteredItems: [],
    userSearchKeyword: "",
    query: {
      keyword: "",
      startDate: "",
      endDate: ""
    }
  },
  onShow() {
    this.setData({ showAddBtn: false });
    updateCustomTabBar(this);
    this.setData({
      isAdmin: isAdmin()
    });
    this.fetchItems();
  },
  applyUserSearch(items, keyword) {
    if (!keyword) return items;
    const k = keyword.toLowerCase();
    return items.filter(item =>
      (item.name || '').toLowerCase().includes(k) ||
      (item.origin || '').toLowerCase().includes(k) ||
      (item.description || '').toLowerCase().includes(k)
    );
  },
  onUserSearchInput(e) {
    const keyword = e.detail.value || '';
    this.setData({
      userSearchKeyword: keyword,
      filteredItems: this.applyUserSearch(this.data.items, keyword)
    });
  },
  onUserSearchClear() {
    this.setData({ userSearchKeyword: '', filteredItems: this.data.items });
  },
  buildQuery(db) {
    if (!this.data.isAdmin) {
      return null;
    }
    const keyword = trimValue(this.data.query.keyword);
    const startDate = this.data.query.startDate;
    const endDate = this.data.query.endDate;
    if (!keyword && !startDate && !endDate) {
      return null;
    }
    const query = {};
    if (keyword) {
      query.name = db.RegExp({
        regexp: escapeRegExp(keyword),
        options: "i"
      });
    }
    if (startDate || endDate) {
      const _ = db.command;
      const start = parseDate(startDate, false);
      const end = parseDate(endDate, true);
      if (start && end) {
        query.createdAt = _.gte(start).and(_.lte(end));
      } else if (start) {
        query.createdAt = _.gte(start);
      } else if (end) {
        query.createdAt = _.lte(end);
      }
    }
    return query;
  },
  fetchItems() {
    const db = getDb();
    if (!db) {
      return;
    }
    const query = this.buildQuery(db);
    this.setData({
      loading: true
    });
    const request = query
      ? db.collection(COLLECTION).where(query)
      : db.collection(COLLECTION);
    request
      .orderBy("createdAt", "desc")
      .get()
      .then((res) => {
        const items = (res && res.data) || [];
        if (this.data.isAdmin) {
          this.setData({
            items,
            filteredItems: items,
            favoriteMap: {}
          });
          return null;
        }
        return this.fetchFavoriteMap(items).then((favoriteMap) => {
          const finalItems = this.applyFavoriteState(items, favoriteMap);
          this.setData({
            items: finalItems,
            filteredItems: this.applyUserSearch(finalItems, this.data.userSearchKeyword),
            favoriteMap
          });
        });
      })
      .catch((err) => {
        if (isPermissionDenied(err)) {
          showToast("数据库权限不足，请检查 nongchanpin_products/favorite_products 集合权限");
          return;
        }
        showToast("加载失败，请稍后再试");
      })
      .finally(() => {
        this.setData({
          loading: false
        });
      });
  },
  fetchFavoriteMap(items) {
    if (this.data.isAdmin || !items.length) {
      return Promise.resolve({});
    }

    const user = getCurrentUser();
    if (!user || !user._id) {
      return Promise.resolve({});
    }

    const db = getDb();
    if (!db) {
      return Promise.resolve({});
    }

    const _ = db.command;
    const productIds = items.map((item) => item._id).filter(Boolean);
    if (!productIds.length) {
      return Promise.resolve({});
    }

    return db
      .collection(FAVORITE_COLLECTION)
      .where({
        userId: user._id,
        productId: _.in(productIds)
      })
      .limit(Math.max(productIds.length, 20))
      .get()
      .then((res) => {
        const favoriteMap = {};
        ((res && res.data) || []).forEach((favorite) => {
          if (favorite && favorite.productId) {
            favoriteMap[favorite.productId] = favorite._id || true;
          }
        });
        return favoriteMap;
      })
      .catch((err) => {
        if (isPermissionDenied(err)) {
          showToast("数据库权限不足，请检查 favorite_products 集合权限");
          return {};
        }
        throw err;
      });
  },
  applyFavoriteState(items, favoriteMap) {
    return items.map((item) => ({
      ...item,
      isFavorite: Boolean(favoriteMap[item._id])
    }));
  },
  onQueryKeywordInput(e) {
    this.setData({
      "query.keyword": e.detail.value
    });
  },
  onQueryStartChange(e) {
    this.setData({
      "query.startDate": e.detail.value
    });
  },
  onQueryEndChange(e) {
    this.setData({
      "query.endDate": e.detail.value
    });
  },
  onQuerySubmit() {
    if (!this.data.isAdmin) {
      showToast("仅管理员可操作");
      return;
    }
    const start = parseDate(this.data.query.startDate, false);
    const end = parseDate(this.data.query.endDate, true);
    if (start && end && start > end) {
      showToast("开始日期不能晚于结束日期");
      return;
    }
    this.fetchItems();
  },
  onQueryReset() {
    this.setData({
      query: {
        keyword: "",
        startDate: "",
        endDate: ""
      }
    });
    this.fetchItems();
  },
  onAddTap() {
    if (!this.data.isAdmin) {
      showToast("仅管理员可操作");
      return;
    }
    wx.navigateTo({
      url: "/pages/nongchanpin-add/nongchanpin-add"
    });
  },
  onItemTap(e) {
    const index = Number(e.currentTarget.dataset.index);
    const item = this.data.filteredItems[index];
    if (!item || !item._id) {
      return;
    }
    wx.navigateTo({
      url: `/pages/nongchanpin-detail/nongchanpin-detail?id=${item._id}`
    });
  },
  onFavoriteTap(e) {
    if (this.data.isAdmin || this.data.favoriteSubmitting) {
      return;
    }

    const user = getCurrentUser();
    if (!user || !user._id) {
      showToast("请先登录");
      wx.reLaunch({
        url: "/pages/auth/auth"
      });
      return;
    }

    const index = Number(e.currentTarget.dataset.index);
    const item = this.data.filteredItems[index];
    if (!item || !item._id) {
      return;
    }

    const db = getDb();
    if (!db) {
      return;
    }

    const favoriteMap = {
      ...this.data.favoriteMap
    };
    const existingId = favoriteMap[item._id];

    this.setData({
      favoriteSubmitting: true
    });

    const done = (isFavorite, favoriteId) => {
      if (isFavorite) {
        favoriteMap[item._id] = favoriteId || true;
      } else {
        delete favoriteMap[item._id];
      }

      const items = this.data.items.map((current) => {
        if (current._id !== item._id) {
          return current;
        }
        return {
          ...current,
          isFavorite
        };
      });

      this.setData({
        items,
        filteredItems: this.applyUserSearch(items, this.data.userSearchKeyword),
        favoriteMap
      });
    };

    const addFavorite = () =>
      db
        .collection(FAVORITE_COLLECTION)
        .add({
          data: {
                userId: user._id,
            userAccount: user.account || "",
            userName: user.name || user.account || "用户",
            productId: item._id,
            name: item.name || "",
            imageUrl: item.imageUrl || "",
            price: Number(item.price) || 0,
            origin: item.origin || "",
            harvestTime: item.harvestTime || "",
            traceInfo: item.traceInfo || "",
            createdAt: db.serverDate(),
            updatedAt: db.serverDate()
          }
        })
        .then((res) => {
          done(true, res && res._id);
          showToast("已收藏");
        });

    const removeFavorite = (id) => {
      if (id && id !== true) {
        return db
          .collection(FAVORITE_COLLECTION)
          .doc(id)
          .remove()
          .then(() => {
            done(false);
            showToast("已取消收藏");
          });
      }

      return db
        .collection(FAVORITE_COLLECTION)
        .where({
          userId: user._id,
          productId: item._id
        })
        .limit(1)
        .get()
        .then((res) => {
          const favorite = res && res.data && res.data[0];
          if (!favorite || !favorite._id) {
            done(false);
            showToast("已取消收藏");
            return null;
          }
          return db.collection(FAVORITE_COLLECTION).doc(favorite._id).remove().then(() => {
            done(false);
            showToast("已取消收藏");
          });
        });
    };

    const action = existingId ? removeFavorite(existingId) : addFavorite();
    Promise.resolve(action)
      .catch((err) => {
        if (isPermissionDenied(err)) {
          showToast("数据库权限不足，请检查 favorite_products 集合权限");
          return;
        }
        showToast("操作失败，请稍后再试");
      })
      .finally(() => {
        this.setData({
          favoriteSubmitting: false
        });
      });
  },
  onEditTap(e) {
    if (!this.data.isAdmin) {
      showToast("仅管理员可操作");
      return;
    }
    const index = Number(e.currentTarget.dataset.index);
    const item = this.data.filteredItems[index];
    if (!item) {
      return;
    }
    wx.navigateTo({
      url: `/pages/nongchanpin-add/nongchanpin-add?id=${item._id}`
    });
  },
  onDeleteTap(e) {
    if (!this.data.isAdmin) {
      showToast("仅管理员可操作");
      return;
    }
    const index = Number(e.currentTarget.dataset.index);
    const item = this.data.filteredItems[index];
    if (!item) {
      return;
    }
    wx.showModal({
      title: "确认删除",
      content: "确定要删除该农产品信息吗？",
      confirmText: "删除",
      confirmColor: "#d14343",
      success: (res) => {
        if (!res.confirm) {
          return;
        }
        const db = getDb();
        if (!db) {
          return;
        }
        wx.showLoading({
          title: "删除中..."
        });
        db.collection(COLLECTION)
          .doc(item._id)
          .remove()
          .then(() => {
            showToast("已删除");
            this.fetchItems();
          })
          .catch((err) => {
            if (isPermissionDenied(err)) {
              showToast("数据库权限不足，请检查 nongchanpin_products 集合权限");
              return;
            }
            showToast("删除失败，请稍后再试");
          })
          .finally(() => {
            wx.hideLoading();
          });
      }
    });
  }
});
