export function floodFill(pixels,index,color) {
  if(pixels[index]===color)return pixels;
  const source=pixels[index],cells=[...pixels],queue=[index];cells[index]=color;
  for(let at=0;at<queue.length;at++){
    const i=queue[at],x=i%16,y=Math.floor(i/16);
    for(const n of [x>0?i-1:-1,x<15?i+1:-1,y>0?i-16:-1,y<15?i+16:-1]){
      if(n>=0&&cells[n]===source){cells[n]=color;queue.push(n);}
    }
  }
  return cells.join('');
}
export function mirroredCells(index,mode) {
  const x=index%16,y=Math.floor(index/16),result=new Set([index]);
  if(mode==='horizontal'||mode==='both')result.add(y*16+15-x);
  if(mode==='vertical'||mode==='both')result.add((15-y)*16+x);
  if(mode==='both')result.add((15-y)*16+15-x);
  return [...result];
}
export function brush(pixels,index,color,mode='off') {
  const cells=[...pixels];for(const i of mirroredCells(index,mode))cells[i]=color;return cells.join('');
}
