import { GridLoader } from "react-spinners";
import { Flex } from "styled-system/jsx";

export function Loader({ fill }: { fill?: boolean }) {
  const loader = <GridLoader color="white" />;
  if (fill) {
    return <Flex css={{ flex: 1, justifyContent: "center", alignItems: "center" }}>{loader}</Flex>;
  }
  return loader;
}
