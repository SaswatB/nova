import { Dialog } from "@radix-ui/themes";

export function BrowserGate({ children }: { children: React.ReactNode }) {
  const supportsFileSystemAPI = "showDirectoryPicker" in window;
  return supportsFileSystemAPI ? (
    <>{children}</>
  ) : (
    <Dialog.Root open={true}>
      <Dialog.Content width="400px">
        <Dialog.Title>Browser not supported</Dialog.Title>
        <Dialog.Description>
          Your browser does not support the File System Access API. Please use a supported browser like Chrome or Edge.
        </Dialog.Description>
      </Dialog.Content>
    </Dialog.Root>
  );
}
