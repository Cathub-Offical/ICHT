const { getRole } = require("../utils/role");

const ADMIN_TABS = [
  {
    pagePath: "pages/home/home",
    text: "首页",
    iconPath: "/assets/tabbar/home-normal.png",
    selectedIconPath: "/assets/tabbar/home-selected.png"
  },
  {
    pagePath: "pages/feiyi/feiyi",
    text: "非遗",
    iconPath: "/assets/tabbar/feiyi-normal.png",
    selectedIconPath: "/assets/tabbar/feiyi-selected.png"
  },
  {
    pagePath: "pages/nongchanpin/nongchanpin",
    text: "农产品",
    iconPath: "/assets/tabbar/nongchanpin-normal.png",
    selectedIconPath: "/assets/tabbar/nongchanpin-selected.png"
  },
  {
    pagePath: "pages/orders/orders",
    text: "订单",
    iconPath: "/assets/tabbar/orders-normal.png",
    selectedIconPath: "/assets/tabbar/orders-selected.png"
  },
  {
    pagePath: "pages/wode/wode",
    text: "我的",
    iconPath: "/assets/tabbar/wode-normal.png",
    selectedIconPath: "/assets/tabbar/wode-selected.png"
  }
];

const USER_TABS = [
  {
    pagePath: "pages/feiyi/feiyi",
    text: "非遗",
    iconPath: "/assets/tabbar/feiyi-normal.png",
    selectedIconPath: "/assets/tabbar/feiyi-selected.png"
  },
  {
    pagePath: "pages/nongchanpin/nongchanpin",
    text: "农产品",
    iconPath: "/assets/tabbar/nongchanpin-normal.png",
    selectedIconPath: "/assets/tabbar/nongchanpin-selected.png"
  },
  {
    pagePath: "pages/ai-chat/ai-chat",
    text: "咨询",
    iconPath: "/assets/tabbar/ai-normal.svg",
    selectedIconPath: "/assets/tabbar/ai-selected.svg"
  },
  {
    pagePath: "pages/orders/orders",
    text: "订单",
    iconPath: "/assets/tabbar/orders-normal.png",
    selectedIconPath: "/assets/tabbar/orders-selected.png"
  },
  {
    pagePath: "pages/wode/wode",
    text: "我的",
    iconPath: "/assets/tabbar/wode-normal.png",
    selectedIconPath: "/assets/tabbar/wode-selected.png"
  }
];

Component({
  data: {
    selected: 0,
    list: []
  },
  lifetimes: {
    attached() {
      this.updateTabBar();
    }
  },
  pageLifetimes: {
    show() {
      this.updateTabBar();
    }
  },
  methods: {
    updateTabBar() {
      const role = getRole();
      const list = role === "admin" ? ADMIN_TABS : USER_TABS;
      const pages = getCurrentPages();
      const currentPage = pages[pages.length - 1];
      const route = currentPage ? currentPage.route : "";
      const selected = list.findIndex((item) => item.pagePath === route);
      this.setData({
        list,
        selected: selected === -1 ? 0 : selected
      });
    },
    onTabChange(e) {
      const path = e.currentTarget.dataset.path;
      if (path) {
        wx.switchTab({
          url: `/${path}`
        });
      }
    }
  }
});
