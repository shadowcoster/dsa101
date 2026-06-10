const containsdublicates=(nums)=>{
    
  let map ={};
  for(let i=0;i<nums.length;i++){
      let num=nums[i];
      if(map[num]===true){
          return true
      }
      map[num]=true;
  }
  return false
}
console.log(containsdublicates([1,2,3,3]))