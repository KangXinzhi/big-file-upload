### 启动项目
```
cd front 
yarn dev
```

```
// 开启http1.1 
// server/upload.jsx 文件夹下的http变量修改为http

cd server
node server.js
```

```
// 开启http2.0
// server/main文件夹下的http变量修改为https

cd server
node server2.js
```

### 大文件断点续传流程
1. 击上传按钮，选择要上传的文件。
2. 文件分片
3. 点击开始上传，计算文件hash值，避免文件名修改后上传，验证文件是否存在，过滤已存在的区块
4. 将分片一个个上传给后端
5. 全部分片上传完成后，前端告诉后端可以合并文件了。
6. 后端合并文件。
7. 完成上传。

### 优化：
- [x] http1.1 升级到 http2.0  
- [x] 网络请求并发限制  
- [x] 抽样hash  