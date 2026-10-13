export const PLAY_SCENES = [
  {
    "id": "night-market",
    "label": "貓咪夜市",
    "prompt": "【虛構情境遊戲】歡迎光臨喵喵夜市！請各位依照現有人設，各提出1個特色攤位點子與1個胡鬧障礙，並保持在3句內。最後請留1道選擇題給人類決定，別替人類下定論喔！"
  },
  {
    "id": "space-picnic",
    "label": "太空野餐",
    "prompt": "【虛構情境遊戲】無重力野餐派對開始！請依現有人設，各提出1道漂浮料理點子與1個失重突發障礙，每人限3句內發言。請在結尾留1個關鍵抉擇讓人類定奪，不要幫人類做決定！"
  },
  {
    "id": "odd-inventions",
    "label": "怪發明展",
    "prompt": "【虛構情境遊戲】怪奇發明博覽會開展！請依目前人設各展示1項古怪發明與其爆笑副作用，發言在3句內完成。結尾請拋出1個投資方向讓人類來挑選，請勿代替人類作結！"
  }
];

// A scene fills an empty draft and explicitly selects its mode; never sends AI work.
export function attachPlayScenes({container, input, translate, isBlocked, onApply}) {
  function render() {
    container.hidden = Boolean(isBlocked() || input.value.trim());
    for (const button of container.querySelectorAll('[data-play-scene]')) {
      const scene = PLAY_SCENES.find(item => item.id === button.dataset.playScene);
      if (scene) button.textContent = translate(scene.label);
    }
  }
  container.addEventListener('click', event => {
    const button = event.target.closest('[data-play-scene]');
    if (!button || !container.contains(button) || isBlocked() || input.value.trim()) return;
    const scene = PLAY_SCENES.find(item => item.id === button.dataset.playScene);
    if (!scene) return;
    input.value = translate(scene.prompt);
    onApply(scene);
    render();
    input.focus();
  });
  input.addEventListener('input', render);
  render();
  return {render};
}

