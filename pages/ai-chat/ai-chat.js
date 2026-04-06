const { updateCustomTabBar } = require('../../utils/tabbar');
const { getStoredUser } = require('../../utils/role');
const { ElderBehavior } = require('../../utils/elder');

const fmt = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// ================================================================
// 替换此函数以接入您自己的 AI 模型
//
// 参数: history  Array<{role: 'user'|'assistant', content: string}>
//               最后一条即为用户刚发送的消息
// 返回: Promise<string>  AI 回复文本
//
// 示例（OpenAI 兼容接口）：
//   return new Promise((resolve, reject) => {
//     wx.request({
//       url: 'https://your-api/v1/chat/completions',
//       method: 'POST',
//       header: { 'Content-Type': 'application/json', Authorization: 'Bearer YOUR_KEY' },
//       data: { model: 'your-model', messages: history },
//       success: res => resolve(res.data.choices[0].message.content),
//       fail: err => reject(err)
//     });
//   });
// ================================================================
const callAiApi = (history) => {
  let task;
  const promise = new Promise((resolve, reject) => {
    task = wx.request({
      url: 'https://api.deepseek.com/v1/chat/completions',
      method: 'POST',
      header: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer sk-5a41e2908c924b3a8326954640178703'
      },
      data: { model: 'deepseek-chat', messages: history },
      success: res => {
        if (res.statusCode !== 200 || !res.data.choices) {
          reject(new Error(res.data && res.data.error && res.data.error.message || '请求失败'));
          return;
        }
        resolve(res.data.choices[0].message.content);
      },
      fail: err => reject(err)
    });
  });
  return { promise, abort: () => task && task.abort() };
};
Page({
  behaviors: [ElderBehavior],

  data: {
    messages: [],
    inputText: '',
    loading: false,
    scrollAnchor: '',
    scrollH: 400,
    userAvatar: '',
    userName: ''
  },

  onLoad() {
    this._idSeq = 0;
    this._calcScrollH();
    const user = getStoredUser();
    if (!user) return;
    const avatarUrl = user.avatarUrl || '';
    if (avatarUrl && avatarUrl.startsWith('cloud://')) {
      wx.cloud.getTempFileURL({
        fileList: [avatarUrl],
        success: res => {
          const url = res.fileList[0] && res.fileList[0].tempFileURL;
          this.setData({ userAvatar: url || '', userName: user.name || '' });
        },
        fail: () => this.setData({ userName: user.name || '' })
      });
    } else {
      this.setData({ userAvatar: avatarUrl, userName: user.name || '' });
    }
  },

  _calcScrollH() {
    const sysInfo = wx.getSystemInfoSync();
    const winH = sysInfo.windowHeight;
    const ratio = sysInfo.windowWidth / 750;
    const statusBarH = sysInfo.statusBarHeight || 0;
    let navContentH = 44;
    try {
      const menu = wx.getMenuButtonBoundingClientRect();
      if (menu && menu.height) {
        navContentH = menu.height + (menu.top - statusBarH) * 2;
      }
    } catch (e) {}
    const navH = statusBarH + navContentH;
    const safeBottom = sysInfo.safeArea ? winH - sysInfo.safeArea.bottom : 0;
    const tabBarH = Math.round(100 * ratio) + safeBottom;
    const inputBarH = Math.round(100 * ratio);
    this.setData({ scrollH: Math.max(winH - navH - inputBarH - tabBarH, 200) });
  },

  onShow() {
    updateCustomTabBar(this);
    if (this.data.messages.length === 0) {
      this._addMsg('ai', '你好！有关非遗梯田文化 ⛰️ 和农产品 🌾 的问题都可以问我哦。');
    }
  },

  _scrollTo(id) {
    this.setData({ scrollAnchor: '' }, () => {
      this.setData({ scrollAnchor: id });
    });
  },

  _addMsg(role, content) {
    const id = `m${++this._idSeq}`;
    const messages = this.data.messages.concat([{ id, role, content, time: fmt() }]);
    this.setData({ messages }, () => { this._scrollTo('msg-bottom'); });
  },

  onInput(e) {
    this.setData({ inputText: e.detail.value });
  },

  onClearInput() {
    this.setData({ inputText: '' });
  },

  onSend() {
    const text = (this.data.inputText || '').trim();
    if (!text || this.data.loading) return;

    this._addMsg('user', text);
    this.setData({ inputText: '', loading: true }, () => { this._scrollTo('msg-loading'); });

    const history = this.data.messages.map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content
    }));

    const { promise, abort } = callAiApi(history);
    this._abortReply = abort;
    promise
      .then(reply => {
        this._addMsg('ai', reply);
      })
      .catch(err => {
        const msg = (err && (err.errMsg || err.message || '')) + '';
        if (msg.includes('abort')) return;
        this._addMsg('ai', '抱歉，AI 暂时无法响应，请稍后再试。');
        wx.showToast({ title: err.message || 'AI 请求失败', icon: 'none' });
      })
      .finally(() => {
        this._abortReply = null;
        this.setData({ loading: false });
      });
  },

  onCancelReply() {
    if (this._abortReply) {
      this._abortReply();
      this._abortReply = null;
    }
    const messages = this.data.messages.filter((_, i, arr) =>
      !(i === arr.length - 1 && arr[i].role === 'user')
    );
    this.setData({ messages, loading: false });
  },

  onClear() {
    wx.showModal({
      title: '清空对话',
      content: '确定清空所有对话记录吗？',
      confirmText: '清空',
      confirmColor: '#d14343',
      success: res => {
        if (!res.confirm) return;
        this._idSeq = 0;
        this.setData({ messages: [], scrollAnchor: '' });
        this._addMsg('ai', '对话已清空，有什么想了解的？🌾');
      }
    });
  }
});
