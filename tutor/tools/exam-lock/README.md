# 定时考试锁

未开放试卷只把元数据和加密文件提交到仓库。题干、配图、答案、讲解脚本全部在 AES-256-GCM 密文内；密钥由 drand quicknet 的未来轮次签名锁定。页面只读取公共签名，不向 drand 发送考试内容。改设备时间不能提前取得未来签名。

`content/exams/releases.json` 列出锁定章节，`chapters.txt` 控制目录顺序。构建器拒绝同一章节同时出现锁定数据和明文题目。`assets/exams/releases.js` 到时解密并通知答案页与大屏页更新；网络失败时保留锁定状态，自动重试，也可点击重试。

当前周练：s03，19 题，15 幅配图，2026-10-16 17:00 Asia/Shanghai（09:00 UTC）开放，quicknet 第 33112612 轮。加密包通过完整性检查后才会显示。用户电脑无需保持开机，但查看时须能连接至少一个 drand 公共节点。

依赖锁定于 package.json / pnpm-lock.yaml。来源与许可证：

- https://github.com/drand/tlock-js — tlock-js 0.9.0，MIT / Apache-2.0
- https://github.com/drand/drand-client — drand-client 1.2.5，MIT / Apache-2.0
- 浏览器包使用 esbuild 0.25.10 生成；其他依赖许可证见 assets/exams/timelock.js.LEGAL.txt。

验证覆盖：已发布的真实签名可解密完整题库；损坏密文被拒绝；调快本机时间并使用旧签名无法打开未来试卷；实际未来签名接口在提前访问时返回 425。

## 生成新试卷

先在仓库之外准备完整 chapter JSON（字段与 data.js 的 chapter 一致）。绝不提交未开考试卷明文或 AES 密钥。安装依赖后执行 seal.cjs；当前工具按 s03 命名输出，复用时须修改输出文件名与 metadata URL。把生成的 metadata.json 条目放进 releases.json，再添加 chapters.txt 目录行。

构建浏览器模块：

```
esbuild browser.js --bundle --minify --platform=browser --target=es2022 --format=esm --outfile=../../assets/exams/timelock.js --legal-comments=linked
```

本次原始试卷与校订参考答案保留在用户本地原文件夹中。
