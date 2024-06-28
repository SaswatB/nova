export const onSubmitEnter =
  (onSubmit: () => void) => (e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.blur();
      onSubmit();
    }
  };
