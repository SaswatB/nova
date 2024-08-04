import { toast, ToastOptions } from "react-toastify";

import { createNodeEffect } from "../effect-types";

export const DisplayToastNEffect = createNodeEffect("display-toast", {
  async run({ message, ...options }: ToastOptions & { message: string }) {
    toast.info(message, options);
  },
});
