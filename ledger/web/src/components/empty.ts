import { h, mount } from '../utils/dom';

export function renderEmpty(host: HTMLElement): void {
  mount(
    host,
    h('div', { class: 'empty-page' }, [
      h('div', { class: 'empty-emoji', html: '🧾' }),
      h('div', { class: 'empty-title' }, ['暂无流水记录']),
      h('div', { class: 'empty-sub' }, [
        '消费消息路由到本项目后,记录将出现在 data/days/。',
      ]),
    ]),
  );
}
