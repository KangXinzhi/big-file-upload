// 第一个和最后一个切片全部读取。
// 对于其他切片，只读取每个切片的首、中、尾三个位置各2个字节，然后将它们拼接起来。

const hashWorker = () => {
  self.importScripts("https://cdnjs.cloudflare.com/ajax/libs/spark-md5/3.0.0/spark-md5.min.js")
  self.onmessage = (e) => {
    const { chunkList } = e.data;
    const spark = new self.SparkMD5.ArrayBuffer();
    let percentage = 0;
    let count = 0;
    const loadNext = index => {
      const reader = new FileReader();
      reader.onload = event => {
        count++;
        if (index === 0 || index === chunkList.length - 1) {
          // For first and last chunks, read entire chunk
          spark.append(event.target.result);
        } else {
          // For other chunks, read first, middle and last 2 bytes
          const chunk = event.target.result;
          const buffer = new ArrayBuffer(6);
          const view = new DataView(buffer);
          view.setUint8(0, chunk[0]);
          view.setUint8(1, chunk[1]);
          view.setUint8(2, chunk[Math.floor(chunk.length / 2) - 1]);
          view.setUint8(3, chunk[Math.floor(chunk.length / 2)]);
          view.setUint8(4, chunk[chunk.length - 2]);
          view.setUint8(5, chunk[chunk.length - 1]);
          spark.append(buffer);
        }
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
      reader.readAsArrayBuffer(chunkList[index].chunk);
    }
    loadNext(count)
  }
}

export default hashWorker