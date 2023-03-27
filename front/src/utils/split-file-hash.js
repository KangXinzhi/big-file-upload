// utils/hash-worker.js
const splitHashWorker = () => {
  self.onmessage = (e) => {
    const { file, size } = e.data;
    const fileChunkList = [];
    let curChunkIndex = 0;
    while (curChunkIndex <= file.size) {
      const chunk = file.slice(curChunkIndex, curChunkIndex + size); //Blob.slice方法分割文件
      fileChunkList.push({ chunk: chunk, })
      curChunkIndex += size;
    }
    self.postMessage({
      fileChunkList
    })
  }
}

export default splitHashWorker
