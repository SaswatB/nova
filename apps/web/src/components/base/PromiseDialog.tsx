import { Dispatch, FunctionComponent, ReactNode, SetStateAction, useEffect, useState } from "react";
import { Button, Dialog } from "@radix-ui/themes";
import { Flex } from "styled-system/jsx";

let setDialogInContainer: Dispatch<SetStateAction<ReactNode>> | undefined;
export const DialogContainer = () => {
  const [Dialog, setDialog] = useState<ReactNode>(null);
  setDialogInContainer = setDialog;
  useEffect(() => () => setDialog(null), []);
  return <>{Dialog}</>;
};

export const createDialog =
  <Props, Return>(Dialog: FunctionComponent<Props & { resolve: (v: Return) => void }>) =>
  (props: Props) =>
    new Promise<Return>((resolve) => setDialogInContainer?.(<Dialog {...props} resolve={resolve} />)).finally(() =>
      setDialogInContainer?.(null),
    );

export const ConfirmDialog = createDialog<
  {
    title?: ReactNode;
    description?: ReactNode;
    width?: string;
    confirmButtonText?: string;
    cancelButtonText?: string;
  },
  boolean
>(({ title, description, width = "400px", confirmButtonText = "Confirm", cancelButtonText = "Cancel", resolve }) => (
  <Dialog.Root open>
    <Dialog.Content width={width}>
      {title ? <Dialog.Title>{title}</Dialog.Title> : null}
      {description ? <Dialog.Description>{description}</Dialog.Description> : null}
      <Flex css={{ justifyContent: "space-between", mt: 16 }}>
        <Button color="red" onClick={() => resolve(false)}>
          {cancelButtonText}
        </Button>
        <Button onClick={() => resolve(true)}>{confirmButtonText}</Button>
      </Flex>
    </Dialog.Content>
  </Dialog.Root>
));
