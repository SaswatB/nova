import { useCallback, useState } from "react";
import { FileRejection, useDropzone } from "react-dropzone";
import { toast } from "react-toastify";
import { TrashIcon } from "@radix-ui/react-icons";
import { IconButton } from "@radix-ui/themes";
import { css } from "styled-system/css";
import { Flex, styled } from "styled-system/jsx";

import { formatError } from "../../../../packages/streamweave-core/src/lib/err";
import { useUpdatingRef } from "../lib/hooks/useUpdatingRef";

const processImage = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        canvas.width = img.width;
        canvas.height = img.height;
        ctx?.drawImage(img, 0, 0);
        resolve(canvas.toDataURL("image/jpeg"));
      };
      img.onerror = reject;
      img.src = event.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export function NewImageDropInput({
  value,
  onChange,
}: {
  value: string[] | undefined;
  onChange: (value: string[]) => void;
}) {
  const valueRef = useUpdatingRef(value);
  const onChangeRef = useUpdatingRef(onChange);
  const [processingImages, setProcessingImages] = useState(false);

  const onDrop = useCallback(
    async (acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
      rejectedFiles.forEach((file) => {
        toast.error(`Failed to process file: ${file.file.name} (${file.errors.map((e) => e.code).join(", ")})`);
      });
      try {
        setProcessingImages(true);
        // lm_1b1492dd9c store base64 jpegs
        const processedImages = await Promise.all(acceptedFiles.map(processImage));
        onChangeRef.current([...(valueRef.current || []), ...processedImages]);
      } catch (error) {
        console.error(error);
        toast.error("Failed to process images: " + formatError(error));
      } finally {
        setProcessingImages(false);
      }
    },
    [onChangeRef, valueRef],
  );
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: { "image/*": [] } });

  return (
    <styled.div
      {...getRootProps()}
      css={{
        border: "1px solid",
        borderColor: isDragActive ? "white" : "white/20",
        borderRadius: "4px",
        padding: "20px",
        textAlign: "center",
        cursor: "pointer",
        backgroundColor: isDragActive ? "white/10" : "black/25",
        color: "white/80",
      }}
    >
      <input {...getInputProps()} />
      <styled.p css={{ fontSize: "14px" }}>
        {processingImages
          ? "Processing images ..."
          : isDragActive
            ? "Drop the images here ..."
            : "Drag 'n' drop some images here, or click to select images"}
      </styled.p>
      {value?.length ? (
        <Flex css={{ flexWrap: "wrap", gap: "10px", marginTop: "10px" }}>
          {value.map((image, index) => (
            <styled.div key={index} css={{ position: "relative", borderRadius: "4px", overflow: "hidden" }}>
              <styled.img
                src={image}
                alt={`uploaded-${index}`}
                css={{ width: "100px", height: "100px", objectFit: "contain", backgroundColor: "black/50" }}
              />
              <IconButton
                color="red"
                variant="soft"
                className={css({
                  position: "absolute",
                  top: "5px",
                  right: "5px",
                  padding: "2px 5px",
                  fontSize: "12px",
                  backgroundColor: "white/20",
                  "&:hover": { backgroundColor: "white/40" },
                })}
                onClick={(e) => {
                  e.stopPropagation();
                  onChangeRef.current(value.filter((_, i) => i !== index));
                }}
              >
                <TrashIcon />
              </IconButton>
            </styled.div>
          ))}
        </Flex>
      ) : null}
    </styled.div>
  );
}
