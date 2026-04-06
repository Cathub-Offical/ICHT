const { isAdmin } = require("../../utils/role");
const { updateCustomTabBar } = require("../../utils/tabbar");
const { ElderBehavior } = require("../../utils/elder");

const ORDER_COLLECTION = "orders";
const CART_COLLECTION = "cart_items";
const STATUS_PENDING = "待发货";
const STATUS_SHIPPING = "配送中";
const STATUS_FINISHED = "已完成";
const MAX_QTY = 99;

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

const getStatusClass = (status) => {
  if (status === STATUS_PENDING) {
    return "pending";
  }
  if (status === STATUS_SHIPPING) {
    return "shipping";
  }
  if (status === STATUS_FINISHED) {
    return "finished";
  }
  return "default";
};

const createOrderNo = () => {
  const now = new Date();
  const randomPart = Math.floor(Math.random() * 9000 + 1000);
  return `NO${now.getFullYear()}${padTwo(now.getMonth() + 1)}${padTwo(now.getDate())}${padTwo(
    now.getHours()
  )}${padTwo(now.getMinutes())}${padTwo(now.getSeconds())}${randomPart}`;
};

const normalizeOrderItems = (items) => {
  if (!Array.isArray(items)) {
    return [];
  }
  return items.map((item) => {
    const quantity = Math.max(1, Number(item.quantity || 1));
    const price = toPriceNumber(item.price);
    const unit = item.unit || "斤";
    return {
      ...item,
      quantity,
      unit,
      priceDisplay: formatAmount(price),
      subtotalDisplay: formatAmount(price * quantity)
    };
  });
};

const normalizeOrder = (order) => {
  const items = normalizeOrderItems(order.items);
  const totalAmountRaw = Object.prototype.hasOwnProperty.call(order, "totalAmount")
    ? order.totalAmount
    : order.amount;
  const totalAmount = toPriceNumber(totalAmountRaw);
  return {
    ...order,
    orderNo: order.orderNo || order.id || "--",
    userName: order.userName || order.customer || order.userAccount || "--",
    status: order.status || STATUS_PENDING,
    statusClass: getStatusClass(order.status || STATUS_PENDING),
    items,
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    totalAmountDisplay: formatAmount(totalAmount),
    createdAtText: formatDateTime(order.createdAt || order.updatedAt)
  };
};

const normalizeCartItem = (item) => {
  const quantity = Math.max(1, Number(item.quantity || 1));
  const price = toPriceNumber(item.price);
  return {
    _id: item._id || "",
    productId: item.productId || "",
    userId: item.userId || "",
    name: item.name || "",
    imageUrl: item.imageUrl || "",
    origin: item.origin || "",
    harvestTime: item.harvestTime || "",
    traceInfo: item.traceInfo || "",
    unit: item.unit || "斤",
    quantity,
    price,
    priceDisplay: formatAmount(price),
    subtotal: toPriceNumber(price * quantity),
    subtotalDisplay: formatAmount(price * quantity)
  };
};

Page({
  behaviors: [ElderBehavior],
  data: {
    isAdmin: false,
    loading: false,
    submitting: false,
    cartItems: [],
    cartCount: 0,
    cartTotal: "0.00",
    userOrders: [],
    adminOrders: []
  },
  onShow() {
    updateCustomTabBar(this);
    const admin = isAdmin();
    this.setData({
      isAdmin: admin
    });

    if (admin) {
      this.fetchAdminOrders();
    } else {
      this.fetchUserData();
    }
  },
  updateCartSummary(cartItems) {
    const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
    const cartTotal = formatAmount(cartItems.reduce((sum, item) => sum + item.subtotal, 0));
    this.setData({
      cartItems,
      cartCount,
      cartTotal
    });
  },
  onAdminOrderNoInput(e) {
    this.setData({ adminOrderNoKeyword: e.detail.value });
  },
  onAdminOrderNoSearch() {
    const keyword = (this.data.adminOrderNoKeyword || '').trim();
    if (!keyword) {
      this.setData({ adminOrdersFiltered: this.data.adminOrders });
      return;
    }
    const filtered = this.data.adminOrders.filter(order => order.orderNo.includes(keyword));
    this.setData({ adminOrdersFiltered: filtered });
  },
  fetchAdminOrders() {
    const db = getDb();
    if (!db) {
      return;
    }

    this.setData({
      loading: true
    });

    db.collection(ORDER_COLLECTION)
      .orderBy("createdAt", "desc")
      .get()
      .then((res) => {
        const adminOrders = ((res && res.data) || []).map(normalizeOrder);
        this.setData({
          adminOrders,
          adminOrdersFiltered: adminOrders
        });
      })
      .catch((err) => {
        if (isPermissionDenied(err)) {
          showToast("数据库权限不足，请检查 orders 集合权限");
          return;
        }
        showToast("加载订单失败");
      })
      .finally(() => {
        this.setData({
          loading: false
        });
      });
  },
  onOrderNoInput(e) {
    this.setData({ orderNoKeyword: e.detail.value });
  },
  onOrderNoSearch() {
    const keyword = (this.data.orderNoKeyword || '').trim();
    if (!keyword) {
      this.fetchUserData();
      return;
    }
    const filtered = this.data.userOrders.filter(order => order.orderNo.includes(keyword));
    this.setData({ userOrdersFiltered: filtered });
  },
  fetchUserData() {
    const user = getCurrentUser();
    if (!user || !user._id) {
      showToast("请先登录");
      wx.reLaunch({
        url: "/pages/auth/auth"
      });
      return;
    }

    const db = getDb();
    if (!db) {
      return;
    }

    this.setData({
      loading: true
    });

    const cartTask = db
      .collection(CART_COLLECTION)
      .where({ userId: user._id })
      .orderBy("updatedAt", "desc")
      .get();

    const orderTask = db
      .collection(ORDER_COLLECTION)
      .where({ userId: user._id })
      .orderBy("createdAt", "desc")
      .get();

    Promise.allSettled([cartTask, orderTask])
      .then((results) => {
        const [cartRes, orderRes] = results;

        if (cartRes.status === "fulfilled") {
          const cartItems = ((cartRes.value && cartRes.value.data) || []).map(normalizeCartItem);
          this.updateCartSummary(cartItems);
        } else {
          this.updateCartSummary([]);
          if (isPermissionDenied(cartRes.reason)) {
            showToast("数据库权限不足，请检查 cart_items 集合权限");
          }
        }

        if (orderRes.status === "fulfilled") {
          const userOrders = ((orderRes.value && orderRes.value.data) || []).map(normalizeOrder);
          this.setData({
            userOrders,
            userOrdersFiltered: userOrders
          });
        } else {
          this.setData({
            userOrders: []
          });
          if (isPermissionDenied(orderRes.reason)) {
            showToast("数据库权限不足，请检查 orders 集合权限");
          }
        }
      })
      .catch(() => {
        showToast("加载失败，请稍后再试");
      })
      .finally(() => {
        this.setData({
          loading: false
        });
      });
  },
  onCartUnitChange(e) {
    if (this.data.submitting) {
      return;
    }
    const index = Number(e.currentTarget.dataset.index);
    const newUnit = e.currentTarget.dataset.unit;
    const target = this.data.cartItems[index];
    if (!target || !target._id || !newUnit) {
      return;
    }
    const currentUnit = target.unit || "斤";
    if (newUnit === currentUnit) {
      return;
    }

    const db = getDb();
    if (!db) {
      return;
    }

    const basePrice = currentUnit === "公斤"
      ? toPriceNumber(target.price / 2)
      : toPriceNumber(target.price);
    const newPrice = newUnit === "公斤"
      ? toPriceNumber(basePrice * 2)
      : toPriceNumber(basePrice);

    db.collection(CART_COLLECTION)
      .doc(target._id)
      .update({
        data: {
          price: newPrice,
          unit: newUnit,
          updatedAt: db.serverDate()
        }
      })
      .then(() => {
        const cartItems = this.data.cartItems.slice();
        const nextItem = {
          ...target,
          price: newPrice,
          unit: newUnit,
          priceDisplay: formatAmount(newPrice),
          subtotal: toPriceNumber(newPrice * target.quantity),
          subtotalDisplay: formatAmount(newPrice * target.quantity)
        };
        cartItems[index] = nextItem;
        this.updateCartSummary(cartItems);
      })
      .catch((err) => {
        if (isPermissionDenied(err)) {
          showToast("数据库权限不足，请检查 cart_items 集合权限");
          return;
        }
        showToast("更新单位失败");
      });
  },
  onCartQtyStep(e) {
    if (this.data.submitting) {
      return;
    }
    const index = Number(e.currentTarget.dataset.index);
    const delta = Number(e.currentTarget.dataset.delta || 0);
    const target = this.data.cartItems[index];
    if (!target || !target._id) {
      return;
    }

    const nextQty = Math.max(1, Math.min(MAX_QTY, target.quantity + delta));
    if (nextQty === target.quantity) {
      return;
    }

    const db = getDb();
    if (!db) {
      return;
    }

    db.collection(CART_COLLECTION)
      .doc(target._id)
      .update({
        data: {
          quantity: nextQty,
          updatedAt: db.serverDate()
        }
      })
      .then(() => {
        const cartItems = this.data.cartItems.slice();
        const nextItem = {
          ...target,
          quantity: nextQty,
          subtotal: toPriceNumber(target.price * nextQty),
          subtotalDisplay: formatAmount(target.price * nextQty)
        };
        cartItems[index] = nextItem;
        this.updateCartSummary(cartItems);
      })
      .catch((err) => {
        if (isPermissionDenied(err)) {
          showToast("数据库权限不足，请检查 cart_items 集合权限");
          return;
        }
        showToast("更新购物车失败");
      });
  },
  onCartRemove(e) {
    if (this.data.submitting) {
      return;
    }
    const index = Number(e.currentTarget.dataset.index);
    const target = this.data.cartItems[index];
    if (!target || !target._id) {
      return;
    }

    wx.showModal({
      title: "移除商品",
      content: "确定将该商品移出购物车吗？",
      confirmColor: "#d14343",
      success: (res) => {
        if (!res.confirm) {
          return;
        }
        const db = getDb();
        if (!db) {
          return;
        }
        db.collection(CART_COLLECTION)
          .doc(target._id)
          .remove()
          .then(() => {
            const cartItems = this.data.cartItems.filter((_, idx) => idx !== index);
            this.updateCartSummary(cartItems);
            showToast("已移除");
          })
          .catch((err) => {
            if (isPermissionDenied(err)) {
              showToast("数据库权限不足，请检查 cart_items 集合权限");
              return;
            }
            showToast("移除失败，请稍后再试");
          });
      }
    });
  },
  onCheckoutCart() {
    if (this.data.submitting) {
      return;
    }
    if (!this.data.cartItems.length) {
      showToast("购物车为空");
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

    const db = getDb();
    if (!db) {
      return;
    }

    const orderItems = this.data.cartItems.map((item) => ({
      productId: item.productId,
      name: item.name || "",
      imageUrl: item.imageUrl || "",
      origin: item.origin || "",
      harvestTime: item.harvestTime || "",
      traceInfo: item.traceInfo || "",
      price: toPriceNumber(item.price),
      unit: item.unit || "斤",
      quantity: item.quantity
    }));

    const totalAmount = toPriceNumber(
      orderItems.reduce((sum, item) => sum + toPriceNumber(item.price) * item.quantity, 0)
    );

    const orderData = {
      orderNo: createOrderNo(),
      userId: user._id,
      userAccount: user.account || "",
      userName: user.name || user.account || "用户",
      status: STATUS_PENDING,
      totalAmount,
      items: orderItems,
      source: "cart",
      createdAt: db.serverDate(),
      updatedAt: db.serverDate()
    };

    this.setData({
      submitting: true
    });
    wx.showLoading({
      title: "下单中..."
    });

    db.collection(ORDER_COLLECTION)
      .add({
        data: orderData
      })
      .then(() => {
        const removeTasks = this.data.cartItems
          .filter((item) => item._id)
          .map((item) => db.collection(CART_COLLECTION).doc(item._id).remove());
        return Promise.all(removeTasks);
      })
      .then(() => {
        this.updateCartSummary([]);
        showToast("下单成功");
        this.fetchUserData();
      })
      .catch((err) => {
        if (isPermissionDenied(err)) {
          showToast("数据库权限不足，请检查 orders/cart_items 集合权限");
          return;
        }
        showToast("下单失败，请稍后再试");
      })
      .finally(() => {
        wx.hideLoading();
        this.setData({
          submitting: false
        });
      });
  },
  onGoProducts() {
    wx.switchTab({
      url: "/pages/nongchanpin/nongchanpin"
    });
  },
  onDeleteOrderTap(e) {
    const orderId = e.currentTarget.dataset.id;
    if (!orderId) return;
    wx.showModal({
      title: '删除订单',
      content: '确定要删除该已完成订单吗？',
      confirmText: '删除',
      confirmColor: '#d14343',
      success: (res) => {
        if (!res.confirm) return;
        const db = getDb();
        if (!db) return;
        wx.showLoading({ title: '删除中...' });
        db.collection('orders').doc(orderId).remove()
          .then(() => {
            showToast('已删除');
            this.fetchUserData();
          })
          .catch((err) => {
            if (isPermissionDenied(err)) {
              showToast('数据库权限不足，请检查 orders 集合权限');
              return;
            }
            showToast('删除失败，请稍后再试');
          })
          .finally(() => {
            wx.hideLoading();
          });
      }
    });
  },
  onAdminDeleteOrderTap(e) {
    const orderId = e.currentTarget.dataset.id;
    if (!orderId) return;
    wx.showModal({
      title: '删除订单',
      content: '确定要删除该订单吗？',
      confirmText: '删除',
      confirmColor: '#d14343',
      success: (res) => {
        if (!res.confirm) return;
        const db = getDb();
        if (!db) return;
        wx.showLoading({ title: '删除中...' });
        db.collection('orders').doc(orderId).remove()
          .then(() => {
            showToast('已删除');
            this.fetchAdminOrders();
          })
          .catch((err) => {
            if (isPermissionDenied(err)) {
              showToast('数据库权限不足，请检查 orders 集合权限');
              return;
            }
            showToast('删除失败，请稍后再试');
          })
          .finally(() => {
            wx.hideLoading();
          });
      }
    });
  },
  onAdminStatusTap(e) {
    const id = e.currentTarget.dataset.id;
    const nextStatus = e.currentTarget.dataset.status;
    if (!id || !nextStatus) {
      return;
    }
    if (!wx.cloud) {
      showToast("云开发未初始化");
      return;
    }
    wx.showLoading({ title: "更新中..." });
    wx.cloud
      .callFunction({
        name: "updateOrderStatus",
        data: { orderId: id, status: nextStatus }
      })
      .then((res) => {
        const result = res && res.result;
        if (!result || !result.success) {
          showToast(result && result.message ? result.message : "更新状态失败");
          return;
        }
        const adminOrders = this.data.adminOrders.map((order) => {
          if (order._id !== id) {
            return order;
          }
          return {
            ...order,
            status: nextStatus,
            statusClass: getStatusClass(nextStatus)
          };
        });
        this.setData({
          adminOrders,
          adminOrdersFiltered: adminOrders
        });
        showToast("状态已更新");
      })
      .catch(() => {
        showToast("更新状态失败");
      })
      .finally(() => {
        wx.hideLoading();
      });
  }
});
