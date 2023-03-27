// upload.js 文件上传组件

import React, { useState, useEffect, useMemo } from "react";
import request from "./utils/request";
import styled from "styled-components";
import hashWorker from "./utils/hash-worker2";
import splitFileHash from "./utils/split-file-hash";
import WorkerBuilder from "./utils/worker-build";

// http / https
const http = "http";
const CHUNK_SIZE = 1000 * 1000 * 1; // 用于设置分片大小 单位b

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

 // 2.worker中文件分片
  const splitFile = (file, size = CHUNK_SIZE) => {
    let time1 = Date.now().valueOf();
    return new Promise(resolve => {
      const woker = new WorkerBuilder(splitFileHash)
      console.log('主线程创建worker分割file', woker)
      woker.postMessage({ file, size })
      woker.onmessage = e => {
        console.log('主线程接收split-file-worker发来的信息 ', e)
        const { fileChunkList } = e.data;
        if (fileChunkList) {
          // 当hash计算完成时，执行resolve
          resolve(fileChunkList);
          let runTime = ((Date.now().valueOf() - time1) / 1000);
          console.log('split-file-worker计算时间：', runTime, 's')
        }
      }
    })
  }

  // 2.文件分片
  // const splitFile = (file, size = CHUNK_SIZE) => {
  //   const fileChunkList = [];
  //   let curChunkIndex = 0;
  //   while (curChunkIndex <= file.size) {
  //     const chunk = file.slice(curChunkIndex, curChunkIndex + size); //Blob.slice方法分割文件
  //     fileChunkList.push({ chunk: chunk, })
  //     curChunkIndex += size;
  //   }
  //   return fileChunkList;
  // }
  // 1.选择文件
  const handleFileChange = async(e) => {
    const { files } = e.target;
    if (files.length === 0) return;
    setFileName(files[0].name);// 保存文件名
    const chunkList = await splitFile(files[0])// 文件分片
    setChunkList(chunkList);
  }

  // 5.发送合并请求
  const mergeRequest = (hash) => {
    request({
      url: `${http}://localhost:3001/merge`,
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
    let time1 = Date.now().valueOf();
    const formDataList = chunksData.map(({ chunk, hash }) => {
      const formData = new FormData()
      formData.append("chunk", chunk);
      formData.append("hash", hash);
      formData.append("suffix", getFileSuffix(fileName));
      return { formData };
    })

    const requestList = formDataList.map(({ formData }, index) => {
      return {
        url: `${http}://localhost:3001/upload`,
        data: formData,
        onprogress: e => {
          let list = [...chunksData];
          list[index].progress = parseInt(String((e.loaded / e.total) * 100));
          setChunkList(list)
        }
      }
    })

    const requestMax = (list, max=1) => {
      return new Promise(resolve => {
        const len = list.length;
        let idx = 0;
        let counter = 0;
        const start = async () => {
          while (idx < len && max > 0) {
            max--; // 占用通道
            console.log(idx, "start");
            request(requestList[idx]).then(() => {
              max++; // 释放通道
              counter++;
              if (counter === len) {
                var runTime = ((Date.now().valueOf() - time1) / 1000);
                console.log('上传时间：', runTime, 's')
                setTimeout(() => {
                  mergeRequest(hash);// 分片全部上传后发送合并请求
                }, 1000);
                resolve();
              } else {
                start();
              }
            })
            idx++;
          }
        }
        start();
      })
    }
    requestMax(requestList, 3)
  }
  // 计算文件hash
  const calculateHash = (chunkList) => {
    let time1 = Date.now().valueOf();
    return new Promise(resolve => {
      const woker = new WorkerBuilder(hashWorker)
      console.log('主线程创建worker计算hash值', woker)
      woker.postMessage({ chunkList: chunkList })
      woker.onmessage = e => {
        console.log('主线程接收worker发来的信息 ', e)
        const { percentage, hash } = e.data;
        setHashPercentage(percentage);
        if (hash) {
          // 当hash计算完成时，执行resolve
          resolve(hash)
          let runTime = ((Date.now().valueOf() - time1) / 1000);
          console.log('hash计算时间：', runTime, 's')
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
    console.log(hash)
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
      url: `${http}://localhost:3001/verFileIsExist`,
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
      <input type="file" onChange={handleFileChange} style={{ color: 'white' }} /><br />
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
  color: white;
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
    color: white;

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
const Label = styled.h3`
  color: white
`
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
      <Label>总进度:{sumProgress.toFixed(2) || 0}%</Label>
    </ProgressWraper >
  )
}

export default UpLoadFile;
