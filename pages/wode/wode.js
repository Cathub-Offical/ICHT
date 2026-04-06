const { isAdmin, ADMIN_ACCOUNT } = require("../../utils/role");
const { updateCustomTabBar } = require("../../utils/tabbar");
const { ElderBehavior } = require("../../utils/elder");

const FAVORITE_COLLECTION = "favorite_products";
const USER_COLLECTION = "users";
const PASSWORD_MIN_LENGTH = 6;
const ACCOUNT_MIN_LENGTH = 4;

const ADMIN_ACTIONS = [
  { key: "users", label: "用户管理" },
  { key: "orders", label: "订单管理" },
  { key: "settings", label: "系统设置" },
  { key: "logout", label: "退出系统", danger: true }
];

const USER_ACTIONS = [
  { key: "favorite", label: "我的收藏" },
  { key: "orders", label: "购物车与订单" },
  { key: "settings", label: "系统设置" },
  { key: "logout", label: "退出系统", danger: true }
];

const trimValue = (value) => String(value || "").trim();

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

const isDuplicateKeyError = (err) => {
  const message = String((err && (err.errMsg || err.message)) || "").toLowerCase();
  const code = String((err && (err.errCode || err.code)) || "").toLowerCase();
  return (
    message.includes("duplicate") ||
    message.includes("e11000") ||
    message.includes("already exists") ||
    code.includes("duplicate") ||
    code.includes("e11000")
  );
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

const buildDefaultUserForm = () => ({
  name: "",
  account: "",
  password: "",
  status: "active",
  statusIndex: 0
});

const normalizeManagedUser = (user) => {
  const status = user && user.status === "disabled" ? "disabled" : "active";
  return {
    ...user,
    status,
    statusLabel: status === "disabled" ? "禁用" : "正常",
    createdAtText: formatDateTime(user && user.createdAt),
    lastLoginAtText: formatDateTime(user && user.lastLoginAt)
  };
};

Page({
  behaviors: [ElderBehavior],
  data: {
    isAdmin: false,
    loadingFavorites: false,
    loadingUsers: false,
    userSubmitting: false,
    user: {
      name: "访客",
      location: "中国"
    },
    actions: USER_ACTIONS,
    favoriteItems: [],
    swipedFavIndex: -1,
    userQueryKeyword: "",
    managedUsers: [],
    statusTextOptions: ["正常", "禁用"],
    userForm: buildDefaultUserForm(),
    editingUserId: ""
  },
  onShow() {
    updateCustomTabBar(this);

    const user = getCurrentUser();
    const admin = isAdmin(user);
    const actions = admin ? ADMIN_ACTIONS : USER_ACTIONS;

    this.setData({
      isAdmin: admin,
      actions,
      "user.name": user && user.name ? user.name : "访客",
      "user.avatarUrl": (user && user.avatarUrl) || ""
    });

    if (admin) {
      this.setData({
        favoriteItems: [],
        loadingFavorites: false,
        managedUsers: [],
        loadingUsers: false,
        editingUserId: "",
        userForm: buildDefaultUserForm(),
        userQueryKeyword: ""
      });
      return;
    }

    this.setData({
      managedUsers: [],
      loadingUsers: false,
      editingUserId: "",
      userForm: buildDefaultUserForm()
    });

    if (!user || !user._id) {
      this.setData({
        favoriteItems: [],
        loadingFavorites: false
      });
      return;
    }

    this.fetchFavorites(user._id);
  },
  fetchFavorites(userId) {
    const db = getDb();
    if (!db) {
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
          showToast("数据库权限不足，请检查 favorite_products 集合权限");
          return;
        }
        showToast("收藏加载失败，请稍后再试");
      })
      .finally(() => {
        this.setData({
          loadingFavorites: false
        });
      });
  },
  fetchManagedUsers() {
    if (!this.data.isAdmin) {
      return;
    }

    const db = getDb();
    if (!db) {
      return;
    }

    this.setData({
      loadingUsers: true
    });

    const _ = db.command;
    const keyword = trimValue(this.data.userQueryKeyword).toLowerCase();

    db.collection(USER_COLLECTION)
      .where({
        account: _.neq(ADMIN_ACCOUNT)
      })
      .orderBy("createdAt", "desc")
      .limit(500)
      .get()
      .then((res) => {
        let managedUsers = ((res && res.data) || []).filter(
          (item) => item && item.account && item.account !== ADMIN_ACCOUNT
        );

        if (keyword) {
          managedUsers = managedUsers.filter((item) => {
            const accountText = String(item.account || "").toLowerCase();
            const nameText = String(item.name || "").toLowerCase();
            return accountText.includes(keyword) || nameText.includes(keyword);
          });
        }

        this.setData({
          managedUsers: managedUsers.map(normalizeManagedUser)
        });
      })
      .catch((err) => {
        if (isPermissionDenied(err)) {
          showToast("数据库权限不足，请检查 users 集合权限");
          return;
        }
        showToast("用户列表加载失败");
      })
      .finally(() => {
        this.setData({
          loadingUsers: false
        });
      });
  },
  onActionTap(e) {
    const action = e.currentTarget.dataset.action;
    const label = e.currentTarget.dataset.label;

    if (action === "logout") {
      wx.showModal({
        title: "确认退出",
        content: "确定要退出系统吗？",
        confirmText: "退出",
        confirmColor: "#d14343",
        success(res) {
          if (res.confirm) {
            wx.removeStorageSync("user");
            wx.reLaunch({
              url: "/pages/auth/auth"
            });
          }
        }
      });
      return;
    }

    if (action === "orders") {
      wx.switchTab({
        url: "/pages/orders/orders"
      });
      return;
    }

    if (action === "favorite") {
      if (this.data.isAdmin) {
        showToast("管理员账号暂无收藏记录");
        return;
      }
      wx.navigateTo({
        url: "/pages/favorite-list/favorite-list"
      });
      return;
    }

    if (action === "users") {
      if (!this.data.isAdmin) {
        showToast("仅管理员可操作");
        return;
      }
      wx.navigateTo({
        url: "/pages/user-manage/user-manage"
      });
      return;
    }

    if (action === "settings") {
      wx.navigateTo({
        url: "/pages/settings/settings"
      });
      return;
    }

    showToast(label || "已点击");
  },
  onFavSwipeStart(e) {
    this._favSwipeStartX = e.changedTouches[0].clientX;
    this._favSwipeStartY = e.changedTouches[0].clientY;
  },
  onFavSwipeMove(e) {
    const dx = e.changedTouches[0].clientX - this._favSwipeStartX;
    const dy = e.changedTouches[0].clientY - this._favSwipeStartY;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 5) {
      e.preventDefault && e.preventDefault();
    }
  },
  onFavSwipeEnd(e) {
    const index = Number(e.currentTarget.dataset.index);
    const dx = e.changedTouches[0].clientX - this._favSwipeStartX;
    const dy = e.changedTouches[0].clientY - this._favSwipeStartY;
    if (Math.abs(dy) > Math.abs(dx) + 10) return;
    if (dx < -30) {
      this.setData({ swipedFavIndex: index });
    } else if (dx > 20) {
      this.setData({ swipedFavIndex: -1 });
    } else if (Math.abs(dx) <= 10 && Math.abs(dy) <= 10) {
      if (this.data.swipedFavIndex !== -1 && this.data.swipedFavIndex !== index) {
        this.setData({ swipedFavIndex: -1 });
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
    if (this.data.isAdmin) {
      return;
    }

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
        showToast("已取消收藏");
      })
      .catch((err) => {
        if (isPermissionDenied(err)) {
          showToast("数据库权限不足，请检查 favorite_products 集合权限");
          return;
        }
        showToast("取消收藏失败");
      });
  },
  onUserQueryInput(e) {
    this.setData({
      userQueryKeyword: e.detail.value
    });
  },
  onUserQuerySubmit() {
    this.fetchManagedUsers();
  },
  onUserQueryReset() {
    this.setData({
      userQueryKeyword: ""
    });
    this.fetchManagedUsers();
  },
  onUserNameInput(e) {
    this.setData({
      "userForm.name": e.detail.value
    });
  },
  onUserAccountInput(e) {
    this.setData({
      "userForm.account": e.detail.value
    });
  },
  onUserPasswordInput(e) {
    this.setData({
      "userForm.password": e.detail.value
    });
  },
  onUserStatusChange(e) {
    const statusIndex = Number(e.detail.value) || 0;
    this.setData({
      "userForm.statusIndex": statusIndex,
      "userForm.status": statusIndex === 1 ? "disabled" : "active"
    });
  },
  onUserEditTap(e) {
    if (!this.data.isAdmin) {
      return;
    }

    const index = Number(e.currentTarget.dataset.index);
    const target = this.data.managedUsers[index];
    if (!target || !target._id) {
      return;
    }
    if (target.account === ADMIN_ACCOUNT) {
      showToast("管理员账号不可修改");
      return;
    }

    this.setData({
      editingUserId: target._id,
      userForm: {
        name: target.name || "",
        account: target.account || "",
        password: "",
        status: target.status === "disabled" ? "disabled" : "active",
        statusIndex: target.status === "disabled" ? 1 : 0
      }
    });

    wx.pageScrollTo({
      selector: "#user-manage-card",
      duration: 280
    });
  },
  resetUserForm() {
    this.setData({
      editingUserId: "",
      userForm: buildDefaultUserForm()
    });
  },
  onUserCancelEdit() {
    this.resetUserForm();
  },
  onUserSubmit() {
    if (!this.data.isAdmin || this.data.userSubmitting) {
      return;
    }

    const db = getDb();
    if (!db) {
      return;
    }

    const editingUserId = this.data.editingUserId;
    const name = trimValue(this.data.userForm.name);
    const account = trimValue(this.data.userForm.account);
    const password = String(this.data.userForm.password || "");
    const status = this.data.userForm.status === "disabled" ? "disabled" : "active";

    if (!name || !account) {
      showToast("请填写姓名和账号");
      return;
    }
    if (account === ADMIN_ACCOUNT) {
      showToast("管理员账号不可操作");
      return;
    }
    if (account.length < ACCOUNT_MIN_LENGTH) {
      showToast("账号长度至少 4 位");
      return;
    }

    if (!editingUserId && password.length < PASSWORD_MIN_LENGTH) {
      showToast("密码长度至少 6 位");
      return;
    }

    if (editingUserId && password && password.length < PASSWORD_MIN_LENGTH) {
      showToast("新密码长度至少 6 位");
      return;
    }

    this.setData({
      userSubmitting: true
    });
    wx.showLoading({
      title: editingUserId ? "保存中..." : "新增中..."
    });

    const handleError = (err) => {
      if (isPermissionDenied(err)) {
        showToast("数据库权限不足，请检查 users 集合权限");
        return;
      }
      if (isDuplicateKeyError(err)) {
        showToast("账号已存在，请更换账号");
        return;
      }
      showToast(editingUserId ? "修改失败，请稍后再试" : "新增失败，请稍后再试");
    };

    const complete = () => {
      wx.hideLoading();
      this.setData({
        userSubmitting: false
      });
    };

    if (editingUserId) {
      const payload = {
        name,
        status,
        role: "user",
        updatedAt: db.serverDate()
      };
      if (password) {
        payload.password = password;
      }

      db.collection(USER_COLLECTION)
        .doc(editingUserId)
        .update({
          data: payload
        })
        .then(() => {
          showToast("修改成功");
          this.resetUserForm();
          this.fetchManagedUsers();
        })
        .catch(handleError)
        .finally(complete);
      return;
    }

    db.collection(USER_COLLECTION)
      .where({ account })
      .limit(1)
      .get()
      .then((res) => {
        if (res && res.data && res.data.length) {
          const err = new Error("DUPLICATE_ACCOUNT");
          err.code = "DUPLICATE_ACCOUNT";
          throw err;
        }
        return db.collection(USER_COLLECTION).add({
          data: {
            account,
            password,
            name,
            role: "user",
            status,
            createdAt: db.serverDate(),
            lastLoginAt: db.serverDate(),
            profile: {
              avatarUrl: "",
              location: ""
            }
          }
        });
      })
      .then(() => {
        showToast("新增成功");
        this.resetUserForm();
        this.fetchManagedUsers();
      })
      .catch((err) => {
        if (err && err.code === "DUPLICATE_ACCOUNT") {
          showToast("账号已存在，请更换账号");
          return;
        }
        handleError(err);
      })
      .finally(complete);
  },
  onUserDeleteTap(e) {
    if (!this.data.isAdmin) {
      return;
    }

    const index = Number(e.currentTarget.dataset.index);
    const target = this.data.managedUsers[index];
    if (!target || !target._id) {
      return;
    }
    if (target.account === ADMIN_ACCOUNT) {
      showToast("管理员账号不可删除");
      return;
    }

    wx.showModal({
      title: "确认删除",
      content: `确定删除用户 ${target.account} 吗？`,
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

        db.collection(USER_COLLECTION)
          .doc(target._id)
          .remove()
          .then(() => {
            showToast("已删除");
            if (this.data.editingUserId === target._id) {
              this.resetUserForm();
            }
            this.fetchManagedUsers();
          })
          .catch((err) => {
            if (isPermissionDenied(err)) {
              showToast("数据库权限不足，请检查 users 集合权限");
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
