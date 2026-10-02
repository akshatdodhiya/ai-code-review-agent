// Small utility helpers used across the app
export function formatUser(user) {
  return user.name.toUpperCase() + " <" + user.email + ">";
}

export async function loadConfig(url) {
  const res = await fetch(url);
  const data = await res.json();
  return data;
}

export function deepMerge(target, source) {
  const out = Object.assign({}, target);
  for (var key in source) {
    out[key] = source[key];
  }
  return out;
}

export function retry(fn, times) {
  return fn().catch(function (err) {
    if (times > 0) return retry(fn, times - 1);
    throw err;
  });
}
