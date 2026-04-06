const { isAdmin } = require("../../utils/role");
const { ElderBehavior } = require("../../utils/elder");

const PRODUCT_COLLECTION = "nongchanpin_products";
const CART_COLLECTION = "cart_items";
const ORDER_COLLECTION = "orders";
const MAX_QTY = 99;

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

const createOrderNo = () => {
  const now = new Date();
  const randomPart = Math.floor(Math.random() * 9000 + 1000);
  return `NO${now.getFullYear()}${padTwo(now.getMonth() + 1)}${padTwo(now.getDate())}${padTwo(
    now.getHours()
  )}${padTwo(now.getMinutes())}${padTwo(now.getSeconds())}${randomPart}`;
};

const UNITS = ["斤", "公斤"];

const getEffectiveUnitPrice = (basePrice, unit) => {
  return unit === "公斤" ? toPriceNumber(basePrice * 2) : toPriceNumber(basePrice);
};

Page({
  behaviors: [ElderBehavior],
  data: {
    loading: false,
    submitting: false,
    isAdmin: false,
    productId: "",
    item: null,
    quantity: 1,
    unit: "斤",
    units: UNITS,
    amountDisplay: "0.00"
  },
  onLoad(options) {
    const user = getCurrentUser();
    if (!user || !user._id) {
      showToast("请先登录");
      wx.reLaunch({
        url: "/pages/auth/auth"
      });
      return;
    }

    const productId = trimValue(options && options.id);
    if (!productId) {
      showToast("缺少产品信息");
      wx.navigateBack();
      return;
    }

    this.setData({
      isAdmin: isAdmin(),
      productId
    });
    this.fetchProduct();
  },
  fetchProduct() {
    const db = getDb();
    if (!db) {
      return;
    }

    this.setData({
      loading: true
    });

    db.collection(PRODUCT_COLLECTION)
      .doc(this.data.productId)
      .get()
      .then((res) => {
        const item = (res && res.data) || null;
        this.setData({
          item,
          amountDisplay: formatAmount(toPriceNumber(item && item.price) * this.data.quantity)
        });
      })
      .catch((err) => {
        if (isPermissionDenied(err)) {
          showToast("数据库权限不足，请检查 nongchanpin_products 集合权限");
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
  updateAmount(quantity, unit) {
    const u = unit !== undefined ? unit : this.data.unit;
    const basePrice = toPriceNumber(this.data.item && this.data.item.price);
    const effectivePrice = getEffectiveUnitPrice(basePrice, u);
    this.setData({
      quantity,
      unit: u,
      amountDisplay: formatAmount(effectivePrice * quantity)
    });
  },
  onUnitChange(e) {
    const unit = e.currentTarget.dataset.unit;
    if (!unit || unit === this.data.unit) {
      return;
    }
    this.updateAmount(this.data.quantity, unit);
  },
  onQuantityStep(e) {
    if (this.data.isAdmin || this.data.submitting) {
      return;
    }
    const delta = Number(e.currentTarget.dataset.delta) || 0;
    const nextQty = Math.max(1, Math.min(MAX_QTY, this.data.quantity + delta));
    this.updateAmount(nextQty);
  },
  buildCartData(db, user, item, quantity, unit) {
    const u = unit || "斤";
    return {
      userId: user._id,
      userAccount: user.account || "",
      userName: user.name || user.account || "用户",
      productId: item._id,
      name: item.name || "",
      imageUrl: item.imageUrl || "",
      origin: item.origin || "",
      harvestTime: item.harvestTime || "",
      traceInfo: item.traceInfo || "",
      price: getEffectiveUnitPrice(toPriceNumber(item.price), u),
      unit: u,
      quantity,
      updatedAt: db.serverDate()
    };
  },
  onAddToCart() {
    if (this.data.isAdmin) {
      showToast("管理员无需加入购物车");
      return;
    }
    if (this.data.submitting || !this.data.item) {
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

    const quantity = this.data.quantity;
    const unit = this.data.unit || "斤";
    const item = this.data.item;

    this.setData({
      submitting: true
    });
    wx.showLoading({
      title: "加入中..."
    });

    db.collection(CART_COLLECTION)
      .where({
        userId: user._id,
        productId: item._id,
        unit
      })
      .limit(1)
      .get()
      .then((res) => {
        const existing = res && res.data && res.data[0];
        if (existing) {
          const nextQty = Math.min(MAX_QTY, Number(existing.quantity || 0) + quantity);
          return db
            .collection(CART_COLLECTION)
            .doc(existing._id)
            .update({
              data: {
                quantity: nextQty,
                updatedAt: db.serverDate()
              }
            })
            .then(() => {
              if (nextQty >= MAX_QTY) {
                showToast("购物车数量已达上限");
              }
            });
        }

        const cartData = this.buildCartData(db, user, item, quantity, unit);
        return db.collection(CART_COLLECTION).add({
          data: {
            ...cartData,
            createdAt: db.serverDate()
          }
        });
      })
      .then(() => {
        showToast("已加入购物车");
      })
      .catch((err) => {
        if (isPermissionDenied(err)) {
          showToast("数据库权限不足，请检查 cart_items 集合权限");
          return;
        }
        showToast("加入购物车失败");
      })
      .finally(() => {
        wx.hideLoading();
        this.setData({
          submitting: false
        });
      });
  },
  onBuyNow() {
    if (this.data.isAdmin) {
      showToast("管理员无需下单");
      return;
    }
    if (this.data.submitting || !this.data.item) {
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

    const item = this.data.item;
    const quantity = this.data.quantity;
    const unit = this.data.unit || "斤";
    const unitPrice = getEffectiveUnitPrice(toPriceNumber(item.price), unit);
    const totalAmount = toPriceNumber(unitPrice * quantity);

    const orderData = {
      orderNo: createOrderNo(),
      userId: user._id,
      userAccount: user.account || "",
      userName: user.name || user.account || "用户",
      status: "待发货",
      totalAmount,
      items: [
        {
          productId: item._id,
          name: item.name || "",
          imageUrl: item.imageUrl || "",
          origin: item.origin || "",
          harvestTime: item.harvestTime || "",
          traceInfo: item.traceInfo || "",
          price: unitPrice,
          unit,
          quantity
        }
      ],
      source: "buy_now",
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
        wx.showModal({
          title: "下单成功",
          content: "订单已创建，是否前往购物车/订单页查看？",
          confirmText: "去查看",
          cancelText: "继续浏览",
          success: (res) => {
            if (res.confirm) {
              wx.switchTab({
                url: "/pages/orders/orders"
              });
            }
          }
        });
      })
      .catch((err) => {
        if (isPermissionDenied(err)) {
          showToast("数据库权限不足，请检查 orders 集合权限");
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
  }
});
