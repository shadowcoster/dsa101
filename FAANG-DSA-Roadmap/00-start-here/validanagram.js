      
const validAnagram =(s,t)=>{
    if(s.length!==t.length) return false
    let map={};
    
    for(let i=0;i<s.length;i++){
        let ch =s[i];
        if(map[ch]===undefined){
            map[ch]=1;
        }else{
            map[ch]++
        }
    }
    for(let i=0;i<t.length;i++){
        let ch =t[i];
        if(map[ch]===undefined||map[ch]===0){
        return false 
        }
       
      map[ch]--
    }

    return true
    
}

console.log(validAnagram("rat", "tar")); //true