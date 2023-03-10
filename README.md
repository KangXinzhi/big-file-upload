### https://juejin.cn/post/7177045936298786872

### https://juejin.cn/post/7182105299921141817

#### 
**Blob对象**  
Blob对象自带属性  
- size 表示二进制对象的大小RE
- type 表示二进制对象的类型 (如果是File对象分割的,会继承type属性)
- slice方法分割文件

**File对象**  
是特殊类型的 Blob，它继承了 Blob 对象，或者说是一种特殊的 Blob 对象，所有可以使用 Blob 对象的场合都可以使用它。

因此可以使用 Blob 的实例方法slice()。

**大文件断点续传流程** 
1. 击上传按钮，选择要上传的文件。
2. 文件分片
3. 点击开始上传，计算文件hash值，避免文件名修改后上传，验证文件是否存在，过滤已存在的区块
4. 将分片一个个上传给后端
5. 全部分片上传完成后，前端告诉后端可以合并文件了。
6. 后端合并文件。
7. 完成上传。

```
// upload.js 文件上传组件

import React, { useState, useEffect, useMemo } from "react";
import request from "./utils/request";
import styled from "styled-components";
import hashWorker from "./utils/hash-worker";
import WorkerBuilder from "./utils/worker-build";

const CHUNK_SIZE = 500; // 用于设置分片大小

const UpLoadFile = function () {
  const [fileName, setFileName] = useState("");
  const [fileHash, setFileHash] = useState("")
  const [chunkList, setChunkList] = useState([])
  const [hashPercentage, setHashPercentage] = useState(0)

  // 获取文件后缀名
  const getFileSuffix = (fileName) => {
    let arr = fileName.split(".");
    if (arr.length > 0) {
      return arr[arr.length - 1]
    }
    return "";
  }

  // 2.文件分片
  const splitFile = (file, size = CHUNK_SIZE) => {
    const fileChunkList = [];
    let curChunkIndex = 0;
    while (curChunkIndex <= file.size) {
      const chunk = file.slice(curChunkIndex, curChunkIndex + size);//Blob.slice方法分割文件
      fileChunkList.push({ chunk: chunk, })
      curChunkIndex += size;
    }
    return fileChunkList;
  }
  // 1.选择文件
  const handleFileChange = (e) => {
    const { files } = e.target;
    if (files.length === 0) return;
    setFileName(files[0].name);// 保存文件名
    const chunkList = splitFile(files[0])// 文件分片
    setChunkList(chunkList);
  }

  // 5.发送合并请求
  const mergeRequest = (hash) => {
    request({
      url: "http://localhost:3001/merge",
      method: "post",
      headers: {
        "content-type": "application/json"
      },
      data: JSON.stringify({
        fileHash: hash,// 服务器存储的文件名：hash+文件后缀名
        suffix: getFileSuffix(fileName),
        size: CHUNK_SIZE// 用于服务器合并文件
      })
    })
  }
  // 4.上传分片
  const uploadChunks = async (chunksData, hash) => {
    const formDataList = chunksData.map(({ chunk, hash }) => {
      const formData = new FormData()
      formData.append("chunk", chunk);
      formData.append("hash", hash);
      formData.append("suffix", getFileSuffix(fileName));
      return { formData };
    })

    const requestList = formDataList.map(({ formData }, index) => {
      return request({
        url: "http://localhost:3001/upload",
        data: formData,
        onprogress: e => {
          let list = [...chunksData];
          list[index].progress = parseInt(String((e.loaded / e.total) * 100));
          setChunkList(list)
        }
      })
    })
    
    Promise.all(requestList).then(() => { // 上传文件
      
      setTimeout(() => {
        mergeRequest(hash);// 分片全部上传后发送合并请求
      }, 1000);

    })
  }
  // 计算文件hash
  const calculateHash = (chunkList) => {
    return new Promise(resolve => {
      const woker = new WorkerBuilder(hashWorker)
      console.log('主线程创建worker计算hash值',woker)
      woker.postMessage({ chunkList: chunkList })
      woker.onmessage = e => {
        console.log('主线程接收worker发来的信息 ',e)
        const { percentage, hash } = e.data;
        setHashPercentage(percentage);
        if (hash) {
          // 当hash计算完成时，执行resolve
          resolve(hash)
        }
      }
    })
  }
  // 3.上传文件
  const handleUpload = async (e) => {
    if (!fileName) {
      alert("请先选择文件")
      return;
    }
    if (chunkList.length === 0) {
      alert("文件拆分中，请稍后...")
      return;
    }
    
    const hash = await calculateHash(chunkList)// 计算hash
    setFileHash(hash)
    const { shouldUpload, uploadedChunkList } = await verfileIsExist(hash, getFileSuffix(fileName));//验证文件是否存在服务器
    if (!shouldUpload) {
      alert("文件已存在，无需重复上传");
      return;
    }
    let uploadedChunkIndexList = [];
    if (uploadedChunkList && uploadedChunkList.length > 0) {
      uploadedChunkIndexList = uploadedChunkList.map(item => {
        const arr = item.split("-");
        return parseInt(arr[arr.length - 1])
      })
      alert("已上传的区块号：" + uploadedChunkIndexList.toString())
    }
    const chunksData = chunkList.map(({ chunk }, index) => ({
      chunk: chunk,
      hash: hash + "-" + index,
      progress: 0
    })).filter(item2 => {
      const arr = item2.hash.split("-")// 过滤掉已上传的块
      return uploadedChunkIndexList.indexOf(parseInt(arr[arr.length - 1])) === -1;
    })
    
    setChunkList(chunksData)// 保存分片数据
    
    uploadChunks(chunksData, hash)// 开始上传分片
  }

  // 验证文件是否存在服务器
  const verfileIsExist = async (fileHash, suffix) => {
    const { data } = await request({
      url: "http://localhost:3001/verFileIsExist",
      headers: {
        "content-type": "application/json"
      },
      data: JSON.stringify({
        fileHash: fileHash,
        suffix: suffix
      })
    })
    return JSON.parse(data);
  }

  return (
    <div>
      <input type="file" onChange={handleFileChange} /><br />
      <button onClick={handleUpload}>上传</button>
      <ProgressBox chunkList={chunkList} />
    </div>
  )
}
const BlockWraper = styled.div`
  width: ${({ size }) => size + "px"};
  height: ${({ size }) => size + "px"};
  text-align: center;
  font-size: 12px;
  line-height: ${({ size }) => size + "px"}; 
  border: 1px solid #ccc;
  position: relative;
  float: left;
  &:before {
    content: "${({ chunkIndex }) => chunkIndex}";
    position: absolute;
    width: 100%;
    height: 10px;
    left: 0;
    top: 0;
    font-size: 12px;
    text-align: left;
    line-height: initial;
    color: #000
  }
  &:after {
    content: "";
    position: absolute;
    width: 100%;
    height: ${({ progress }) => progress + "%"};
    background-color: pink;
    left: 0;
    top: 0;
    z-index: -1;
  }
`
const ChunksProgress = styled.div`
  *zoom: 1;
  &:after {
    content: "";
    display: block;
    clear: both;
  }
`
const Label = styled.h3``
const ProgressWraper = styled.div``
const Block = ({ progress, size, chunkIndex }) => {
  return (<BlockWraper size={size} chunkIndex={chunkIndex} progress={progress}>
    {progress}%
  </BlockWraper>)
}

const ProgressBox = ({ chunkList = [], size = 40 }) => {
  const sumProgress = useMemo(() => {
    if (chunkList.length === 0) return 0
    return chunkList.reduce((pre, cur, sum) => pre + cur.progress / 100, 0) * 100 / (chunkList.length)
  }, [chunkList])

  return (
    <ProgressWraper>
      <Label>文件切分为{chunkList.length}段，每段上传进度如下：</Label>
      <ChunksProgress>
        {chunkList.map(({ progress }, index) => (
          <Block key={index} size={size} chunkIndex={index} progress={progress} />
        ))}
      </ChunksProgress>
      <Label>总进度:{sumProgress.toFixed(2)}%</Label>
    </ProgressWraper >
  )
}

export default UpLoadFile;

```


```
// utils/hash-worker.js
const hashWorker = () => {
  self.importScripts("http://localhost:3000/spark-md5.min.js")
  self.onmessage = (e) => {
    const { chunkList } = e.data;
    const spark = new self.SparkMD5.ArrayBuffer();
    let percentage = 0;
    let count = 0;
    const loadNext = index => {
      const reader = new FileReader();
      reader.readAsArrayBuffer(chunkList[index].chunk);
      reader.onload = event => {
        count++;
        spark.append(event.target.result);
        if (count === chunkList.length) {
          self.postMessage({
            percentage: 100,
            hash: spark.end()
          })
          self.close();
        } else {
          percentage += (100 / chunkList.length)
          self.postMessage({
            percentage
          })
          loadNext(count)
        }
      }
    }
    loadNext(count)
  }
}

export default hashWorker
```


```
// utils/worker-build.js
export default class WorkerBuilder extends Worker {
    constructor(worker) {
      const code = worker.toString();
      const blob = new Blob([`(${code})()`]);
      return new Worker(URL.createObjectURL(blob));
    }
  }
```

```
/ utils/request.js
const request = ({
    url,
    method = "post",
    data,
    headers = {},
    onprogress
  }) => {
    return new Promise(resolve => {
      const xhr = new XMLHttpRequest();
      xhr.open(method, url);
      Object.keys(headers).forEach(key =>
        xhr.setRequestHeader(key, headers[key])
      );
      xhr.upload.onprogress = onprogress
      xhr.send(data);
      xhr.onload = e => {
        resolve({
          data: e.target.response
        });
      };
    });
  }
  
  export default request;
```


```
// express 服务
const multiparty = require("multiparty");
const bodyParser = require("body-parser");
const express = require('express')
const path = require('path')
const fse = require("fs-extra")

let app = express()
const DirName = path.resolve(path.dirname(''));
const UPLOAD_FILES_DIR = path.resolve(DirName, "./filelist")
// 配置请求参数解析器
const jsonParser = bodyParser.json({ extended: false });
// 配置跨域
app.use(function (req, res, next) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  next()
})
// 获取已上传的文件列表
const getUploadedChunkList = async (fileHash) => {
  const isExist = fse.existsSync(path.resolve(UPLOAD_FILES_DIR, fileHash))
  if (isExist) {
    return await fse.readdir(path.resolve(UPLOAD_FILES_DIR, fileHash))
  }
  return []
}

app.post('/verFileIsExist', jsonParser, async (req, res) => {
  const { fileHash, suffix } = req.body;
  const filePath = path.resolve(UPLOAD_FILES_DIR, fileHash + "." + suffix);
  if (fse.existsSync(filePath)) {
    res.send({
      code: 200,
      shouldUpload: false
    })
    return;
  }
  const list = await getUploadedChunkList(fileHash);
  if (list.length > 0) {
    res.send({
      code: 200,
      shouldUpload: true,
      uploadedChunkList: list
    })
    return;
  }
  res.send({
    code: 200,
    shouldUpload: true,
    uploadedChunkList: []
  })
})

app.post('/upload', async (req, res) => {
  const multipart = new multiparty.Form();
  multipart.parse(req, async (err, fields, files) => {
    if (err) return;
    const [chunk] = files.chunk;
    const [hash] = fields.hash;
    const [suffix] = fields.suffix;
    // 注意这里的hash包含文件的hash和块的索引，所以需要使用split切分
    const chunksDir = path.resolve(UPLOAD_FILES_DIR, hash.split("-")[0]);
    if (!fse.existsSync(chunksDir)) {
      await fse.mkdirs(chunksDir);
    }
    await fse.move(chunk.path, chunksDir + "/" + hash);
  })
  res.status(200).send("received file chunk")
})

const pipeStream = (path, writeStream) =>
  new Promise(resolve => {
    const readStream = fse.createReadStream(path);
    readStream.on("end", () => {
      fse.unlinkSync(path);
      resolve();
    });
    readStream.pipe(writeStream);
  });

// 合并切片
const mergeFileChunk = async (filePath, fileHash, size) => {
  const chunksDir = path.resolve(UPLOAD_FILES_DIR, fileHash);
  const chunkPaths = await fse.readdir(chunksDir);
  chunkPaths.sort((a, b) => a.split("-")[1] - b.split("-")[1]);
  console.log("指定位置创建可写流", filePath);
  await Promise.all(
    chunkPaths.map((chunkPath, index) =>
      pipeStream(
        path.resolve(chunksDir, chunkPath),
        // 指定位置创建可写流
        fse.createWriteStream(filePath, {
          start: index * size,
          end: (index + 1) * size
        })
      )
    )
  );
  // 合并后删除保存切片的目录
  fse.rmdirSync(chunksDir);
};

app.post('/merge', jsonParser, async (req, res) => {
  const { fileHash, suffix, size } = req.body;
  const filePath = path.resolve(UPLOAD_FILES_DIR, fileHash + "." + suffix);
  await mergeFileChunk(filePath, fileHash, size);
  res.send({
    code: 200,
    message: "success"
  });
})

app.listen(3001, () => {
  console.log('listen:3001')
})
```

  