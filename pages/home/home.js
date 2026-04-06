const WxCharts = require('../../utils/wxcharts.js');
const { isAdmin } = require("../../utils/role");
const { updateCustomTabBar } = require("../../utils/tabbar");
const { ElderBehavior } = require("../../utils/elder");

const COLLECTIONS = {
  orders: "orders",
  feiyi: "feiyi_culture",
  products: "nongchanpin_products"
};

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

const formatTime = (date) => {
  const pad = (num) => String(num).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
};

let pieChart = null;

Page({
  behaviors: [ElderBehavior],
  data: {
    loading: false,
    lastUpdated: "--",
    stats: {
      orders: {
        total: 0,
        pending: 0,
        shipping: 0,
        finished: 0
      },
      feiyi: {
        total: 0
      },
      products: {
        total: 0
      }
    },
    shortcuts: [
      { key: "orders", label: "订单管理", path: "/pages/orders/orders" },
      { key: "feiyi", label: "非遗文化", path: "/pages/feiyi/feiyi" },
      { key: "nongchanpin", label: "农产品", path: "/pages/nongchanpin/nongchanpin" }
    ]
  },
  onShow() {
    this.pieReady = false;

    if (!isAdmin()) {
      wx.showToast({
        title: "仅管理员可访问",
        icon: "none"
      });
      wx.switchTab({
        url: "/pages/feiyi/feiyi"
      });
      return;
    }
    updateCustomTabBar(this);
    this.fetchStats();
  },
  onReady() {
    // 动态获取canvas宽度，兼容真机
    wx.createSelectorQuery().select('#orderPieCanvas').boundingClientRect(rect => {
      if (!rect) return;
      this.pieReady = true;
      this.pieWidth = rect.width;
      this.renderOrderPie();
    }).exec();
  },
  renderOrderPie() {
    if (!this.pieReady) return;
    const stats = this.data.stats.orders;
    const total = stats.pending + stats.shipping + stats.finished;
    // 至少有一项非0，否则mock一组数据
    const series = total > 0 ? [
      { name: '待发货', data: stats.pending },
      { name: '配送中', data: stats.shipping },
      { name: '已完成', data: stats.finished }
    ] : [
      { name: '待发货', data: 1 },
      { name: '配送中', data: 1 },
      { name: '已完成', data: 1 }
    ];
    if (pieChart) pieChart.updateData({ series });
    else pieChart = new WxCharts({
      canvasId: 'orderPie',
      type: 'pie',
      series,
      width: this.pieWidth || 320,
      height: 220,
      dataLabel: true
    });
  },
  fetchStats() {
    const db = getDb();
    if (!db) {
      return;
    }
    this.setData({
      loading: true
    });

    const countAll = (collection) => db.collection(collection).count().then((res) => res.total || 0);
    const countStatus = (status) =>
      db
        .collection(COLLECTIONS.orders)
        .where({ status })
        .count()
        .then((res) => res.total || 0);

    const tasks = {
      ordersTotal: countAll(COLLECTIONS.orders),
      ordersPending: countStatus("待发货"),
      ordersShipping: countStatus("配送中"),
      ordersFinished: countStatus("已完成"),
      feiyiTotal: countAll(COLLECTIONS.feiyi),
      productsTotal: countAll(COLLECTIONS.products)
    };

    const keys = Object.keys(tasks);
    Promise.allSettled(Object.values(tasks))
      .then((results) => {
        const values = {};
        let permissionError = false;
        results.forEach((result, index) => {
          const key = keys[index];
          if (result.status === "fulfilled") {
            values[key] = result.value || 0;
          } else {
            values[key] = 0;
            if (isPermissionDenied(result.reason)) {
              permissionError = true;
            }
          }
        });

        this.setData({
          stats: {
            orders: {
              total: values.ordersTotal,
              pending: values.ordersPending,
              shipping: values.ordersShipping,
              finished: values.ordersFinished
            },
            feiyi: {
              total: values.feiyiTotal
            },
            products: {
              total: values.productsTotal
            }
          },
          lastUpdated: formatTime(new Date())
        }, () => {
          this.renderOrderPie();
        });

        if (permissionError) {
          showToast("数据库权限不足，请检查 orders/feiyi_culture/nongchanpin_products 集合权限");
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
  onShortcutTap(e) {
    const path = e.currentTarget.dataset.path;
    if (path) {
      wx.switchTab({
        url: path
      });
    }
  }
});
