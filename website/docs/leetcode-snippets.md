# Snippets of Code From Practicing LeetCode

## Python Snippets

### Using ord() to count frequency of letters

```
def groupAnagrams_hash(strs: list[str]) -> list[list[str]]:
    result = {}
    for x in strs:
        # create an array with each letter
        count = [0] * 26
        for c in x:
            # ord(c) - ord('a') returns the array position for count zero indexed
            count[ord(c) - ord('a')] += 1
        if tuple(count) not in result:
            result[tuple(count)] = [x]
        else:
            result[tuple(count)].append(x)
    return list(result.values())
```