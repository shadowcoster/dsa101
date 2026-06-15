const isPalindrome = (s) => {
  let l = 0, r = s.length - 1;

  const valid = (c) =>{
    (c >= 'a' && c <= 'z') ||
    (c >= 'A' && c <= 'Z') ||
    (c >= '0' && c <= '9');
  }
  while (l < r) {
    while (l < r && !valid(s[l])) l++;
    while (l < r && !valid(s[r])) r--;

    if (s[l].toLowerCase() !== s[r].toLowerCase()) return false;

    l++;
    r--;
  }

  return true;
};