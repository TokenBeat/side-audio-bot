// 品牌层的全局配置。
//
// brandVersion 是对外发行版本号：apply 会把它结构化盖写到 public 的全部
// workspace package.json 与 package-lock.json（与上游的版本号解耦，上游
// 升版不影响它）。发新版本前先在这里升号，再 `npm run release <同一版本>`。

export const brandVersion = '0.11.0';
