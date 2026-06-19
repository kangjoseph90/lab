import { add, evaluate, mul, n } from '@lab/math';
import './styles.css';

type Project = {
    title: string;
    description: string;
    status: 'draft' | 'planned';
};

const projects: Project[] = [
    {
        title: 'Mandelbrot Viewer',
        description: '복소평면을 탐색하는 인터랙티브 프랙탈 시각화.',
        status: 'planned',
    },
    {
        title: 'Graph Calculator',
        description: '수식을 그리고 조작하는 그래프 계산기.',
        status: 'planned',
    },
    {
        title: 'Math Engine',
        description: `packages/math smoke test: 2 + 3 * 4 = ${evaluate(add(n(2), mul(n(3), n(4))))}`,
        status: 'draft',
    },
];

const app = document.querySelector<HTMLElement>('#app');

if (!app) {
    throw new Error('App root was not found.');
}

app.innerHTML = `
  <section class="shell">
    <header class="page-header">
      <p class="eyebrow">Personal Web Lab</p>
      <h1>Math, visualization, and small experiments</h1>
    </header>
    <section class="project-grid">
      ${projects
          .map(
              (project) => `
            <article class="project-card">
              <div>
                <p class="status">${project.status}</p>
                <h2>${project.title}</h2>
              </div>
              <p>${project.description}</p>
            </article>
          `,
          )
          .join('')}
    </section>
  </section>
`;
