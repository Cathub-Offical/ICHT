const updateCustomTabBar = (page) => {
  if (!page || typeof page.getTabBar !== "function") {
    return;
  }
  const tabBar = page.getTabBar();
  if (tabBar && typeof tabBar.updateTabBar === "function") {
    tabBar.updateTabBar();
  }
};

module.exports = {
  updateCustomTabBar
};
