const validPara=(s)=>{
    let stack=[];
    let i =0;
    for(i;i<s.length;i++){
        let ch =s[i];
        if(ch==='{'||ch==='['||ch==='('){
            stack[stack.length]=ch;
        }else{
            if(stack.length===0){
                return 0;
            }
            let top = stack[stack.length-1]
            if(ch===')'&& top==='('||
                ch===']'&& top==='['||
                    ch==='}'&&top==='{'){
                        stack.length=stack.length-1
                    }else{
                        return false;
                        
                    }
                    
        }
        
    }
    
return stack.length===0
    
}
console.log(validPara('{[()]'))