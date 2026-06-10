const twoSum = (nums, target) => {
  let map = {};

  for (let i = 0; i < nums.length; i++) {
    let current = nums[i];
    let needed = target - current;

    if (map[needed] !== undefined) {
      return [map[needed], i];
    }

    map[current] = i;
  }
};


console.log(twoSum([2, 7, 11, 15], 9)); // [0, 1]