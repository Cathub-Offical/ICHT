const { isAdmin } = require("../../utils/role");
const { updateCustomTabBar } = require("../../utils/tabbar");
const { ElderBehavior } = require("../../utils/elder");

const COLLECTION = "feiyi_culture";

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
    // hero-card逻辑
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
    showBackTop: false,
    showAddBtn: false,
    isAdmin: false,
    loading: false,
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
    // 兼容普通用户，确保回到顶部按钮逻辑生效
    this.setData({ showBackTop: false });
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
      query.title = db.RegExp({
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
  applyUserSearch(items, keyword) {
    if (!keyword) return items;
    const k = keyword.toLowerCase();
    return items.filter(item =>
      (item.title || '').toLowerCase().includes(k) ||
      (item.location || '').toLowerCase().includes(k) ||
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
        this.setData({
          items,
          filteredItems: this.applyUserSearch(items, this.data.userSearchKeyword)
        });
      })
      .catch((err) => {
        if (isPermissionDenied(err)) {
          showToast("数据库权限不足，请检查 feiyi_culture 集合权限");
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
      url: "/pages/feiyi-add/feiyi-add"
    });
  },
  onItemTap(e) {
    const index = Number(e.currentTarget.dataset.index);
    const item = this.data.filteredItems[index];
    if (!item || !item._id) {
      return;
    }
    wx.navigateTo({
      url: `/pages/feiyi-detail/feiyi-detail?id=${item._id}`
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
      url: `/pages/feiyi-add/feiyi-add?id=${item._id}`
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
      content: "确定要删除该非遗梯田文化信息吗？",
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
              showToast("数据库权限不足，请检查 feiyi_culture 集合权限");
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
