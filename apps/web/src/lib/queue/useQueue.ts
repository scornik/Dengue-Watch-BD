"use client";

import { useEffect, useState } from "react";
import { listQueue, onQueueChange } from "./db";

export function useQueueCount(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let alive = true;
    const refresh = () =>
      listQueue()
        .then((items) => alive && setCount(items.length))
        .catch(() => {});
    refresh();
    const off = onQueueChange(refresh);
    return () => {
      alive = false;
      off();
    };
  }, []);
  return count;
}
