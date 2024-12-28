import { toast, ToastOptions } from "react-toastify";

import { swEffect } from "../swEffect";

export const DisplayToastNEffect = swEffect.runnable(
  async ({ message, ...options }: ToastOptions & { message: string }) => {
    toast.info(message, options);
  },
);
