const { isAdmin, ADMIN_ACCOUNT } = require("../../utils/role");
const { ElderBehavior } = require("../../utils/elder");

const USER_COLLECTION = "users";
const PASSWORD_MIN_LENGTH = 6;
const ACCOUNT_MIN_LENGTH = 4;

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
    loading: false,
    loadingUsers: false,
    userSubmitting: false,
    userQueryKeyword: "",
    managedUsers: [],
    statusTextOptions: ["正常", "禁用"],
    userForm: buildDefaultUserForm(),
    editingUserId: "",
    swipedIndex: -1
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
  onShow() {
    const user = getCurrentUser();
    const admin = isAdmin(user);

    this.setData({
      isAdmin: admin
    });

    if (!admin) {
      showToast("仅管理员可访问");
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

    this.fetchManagedUsers();
  },
  onPullDownRefresh() {
    if (!this.data.isAdmin) {
      wx.stopPullDownRefresh();
      return;
    }

    this.fetchManagedUsers(() => {
      wx.stopPullDownRefresh();
    });
  },
  fetchManagedUsers(done) {
    if (!this.data.isAdmin) {
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
        if (typeof done === "function") {
          done();
        }
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
      selector: "#user-form-card",
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
      const payload = { name, status, role: "user" };
      if (password) {
        payload.password = password;
      }

      wx.cloud.callFunction({
        name: "updateUser",
        data: { userId: editingUserId, payload }
      })
        .then((res) => {
          const result = res && res.result;
          if (!result || !result.success) {
            showToast("修改失败：" + (result && result.message || "未知错误"));
            return;
          }
          showToast("修改成功");
          this.resetUserForm();
          this.fetchManagedUsers();
        })
        .catch(() => showToast("云函数调用失败，请稍后再试"))
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

        wx.showLoading({
          title: "删除中..."
        });

        wx.cloud.callFunction({
          name: "deleteUser",
          data: { userId: target._id }
        })
          .then((res) => {
            const result = res && res.result;
            if (!result || !result.success) {
              showToast("删除失败：" + (result && result.message || "未知错误"));
              return;
            }
            showToast("已删除");
            if (this.data.editingUserId === target._id) {
              this.resetUserForm();
            }
            this.fetchManagedUsers();
          })
          .catch(() => {
            showToast("云函数调用失败，请稍后再试");
          })
          .finally(() => {
            wx.hideLoading();
          });
      }
    });
  }
});