import React, { useRef, useState } from "react";

export function ChatInput({ onSendMessage }: { onSendMessage: (message: string, files: File[]) => void }) {
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMessage(e.target.value);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      setFiles(selectedFiles);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files);
    setFiles(droppedFiles);
  };

  const handleImageClick = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        setPreviewImage(e.target.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSendMessage = () => {
    if (message.trim() !== "" || files.length > 0) {
      onSendMessage(message, files);
      setMessage("");
      setFiles([]);
      setPreviewImage(null);
    }
  };

  return (
    <div className="chat-input" onDragOver={handleDragOver} onDrop={handleDrop}>
      <input type="text" placeholder="Type a message..." value={message} onChange={handleInputChange} />
      <input type="file" ref={fileInputRef} style={{ display: "none" }} onChange={handleFileChange} multiple />
      <button onClick={() => fileInputRef.current?.click()}>Attach File</button>
      <button onClick={handleSendMessage}>Send</button>
      {previewImage && (
        <div className="image-preview">
          <img src={previewImage} alt="Preview" />
        </div>
      )}
      {files.length > 0 && (
        <div className="file-list">
          {files.map((file, index) => (
            <div key={index} className="file-item" onClick={() => handleImageClick(file)}>
              {file.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
