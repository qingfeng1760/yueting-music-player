// 游戏娱乐：v1 占位页（卡片布局已留好，后续直接填玩法）
export async function render(root) {
  root.innerHTML = `
    <h1 class="page-title">游戏娱乐</h1>
    <div class="page-sub">用你的本地音乐玩点小游戏，功能开发中</div>

    <div class="game-card">
      <span class="game-icon"></span>
      <div style="flex:1">
        <div class="game-title">猜歌名</div>
        <div class="game-sub">听前奏猜歌名，用你自己的曲库出题</div>
      </div>
      <span class="chip chip-gray">敬请期待</span>
    </div>

    <div class="game-card" style="opacity:.72">
      <span class="game-icon">🎯</span>
      <div style="flex:1">
        <div class="game-title">节奏点击</div>
        <div class="game-sub">跟着节拍点击，看你能连多少下</div>
      </div>
      <span class="chip chip-gray">规划中</span>
    </div>

    <div class="empty" style="padding-top:24px">
      <span class="empty-icon">🎮</span>
      玩法还在准备中<br>当前版本先把入口留在这里，不影响听歌
    </div>`;
}