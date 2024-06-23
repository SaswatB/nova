import { Page } from "puppeteer";

const BLACKLISTED_TAGS = ["meta", "link", "script", "style", "iframe", "embed", "object", "noscript"];

export interface TextNode {
  type: "text";
  text: string;
  size: string;
  weight?: string;
}

export interface ImageNode {
  type: "image";
  height: number;
  width: number;
  src: string;
  alt?: string;
}

export interface ContainerNode {
  type: "element";
  tag: string;
  id: number;
  areaPercent?: number;
  children?: (ContainerNode | TextNode | ImageNode)[];
}
export type WebNode = ContainerNode | TextNode | ImageNode;

export interface ContainerNodeWithElement extends ContainerNode {
  el: Element;
  children?: (ContainerNodeWithElement | TextNode | ImageNode)[];
}
export type WebNodeWithElement = ContainerNodeWithElement | TextNode | ImageNode;

/**
 * Strips WebNode to the absolute minimum required to represent the page.
 * Not suitable for generating selectors as id is removed.
 */
export function superStripWebNode(n: WebNode, newImageMapping: (src: string) => string): unknown {
  if (n.type === "text") {
    return n.text;
  } else if (n.type === "image") {
    return { src: newImageMapping(n.src), alt: n.alt };
  }

  const { type, id, ...n2 } = n;
  let tag: string | undefined = n.tag;
  const children = n.children?.map((c) => superStripWebNode(c, newImageMapping));
  if (children?.length === 1) return children[0]; // todo consider if the tag make this valuable to keep

  // clear div tag as it's very common, and mostly implied
  if (["div"].includes(tag)) tag = undefined;

  return { ...n2, children, tag };
}

export function superStripWebNodeWithImgMap(webNode: WebNode) {
  let imgCounter = 0;
  const imgMappings: { key: string; value: string }[] = [];
  const strippedNodes = superStripWebNode(webNode, (src) => {
    // todo consider if img map has value
    // const key = "image://" + imgCounter++;
    // imgMappings.push({ key, value: src });
    // return key;
    return src;
  });

  return { strippedNodes, imgMappings };
}

export function extractWebNodes(page: Page) {
  return page.evaluate(
    ([BLACKLISTED_TAGS]) => {
      let counter = 0;

      const resultMap: ContainerNodeWithElement = {
        type: "element",
        el: document.body,
        tag: "body",
        id: counter++,
        areaPercent: 100,
      };
      const bodyBounds = resultMap.el.getBoundingClientRect();
      const bodyArea = bodyBounds.width * bodyBounds.height;

      function isElement(el: ChildNode): el is HTMLElement {
        return el.nodeType === 1;
      }

      function fillMap(parent: ContainerNodeWithElement) {
        parent.el.childNodes.forEach((child) => {
          if (isElement(child)) {
            const tag = child.tagName.toLowerCase();
            if (BLACKLISTED_TAGS!.some((t) => t === tag)) return;
            if (child.hidden) return;
            const bounds = child.getBoundingClientRect();
            const area = bounds.width * bounds.height;
            const areaPercent = Math.round((area / bodyArea) * 100);

            // handle images
            if (tag === "img") {
              if (area < 400) return;

              const imgElement = child as HTMLImageElement;
              const bounds = imgElement.getBoundingClientRect();

              const childNode: ImageNode = {
                type: "image",
                height: Math.round(bounds.height),
                width: Math.round(bounds.width),
                src: imgElement.src,
                alt: imgElement.alt || undefined,
              };

              parent.children = parent.children || [];
              parent.children.push(childNode);
              return;
            }

            const childNode: ContainerNodeWithElement = {
              type: "element",
              el: child,
              tag,
              id: counter++,
              areaPercent,
            };
            parent.children = parent.children || [];
            parent.children.push(childNode);
            fillMap(childNode);
          } else if (child.nodeType === 3) {
            const text = child.textContent?.trim() || "";
            if (!text) return;

            // if (text.length > 100) {
            //   text = text.slice(0, 100) + "...";
            // }

            const parentElement = child.parentNode as HTMLElement;
            const style = window.getComputedStyle(parentElement, null);

            // check if text is visible
            if (style.getPropertyValue("display") === "none") return;
            if (style.getPropertyValue("visibility") === "hidden") return;
            if (style.getPropertyValue("opacity") === "0") return;
            if (style.getPropertyValue("clip") === "rect(0px, 0px, 0px, 0px)") return;
            if (style.getPropertyValue("width") === "0px") return;
            if (style.getPropertyValue("height") === "0px") return;
            if (style.getPropertyValue("color") === "transparent") return;
            if (style.getPropertyValue("transform") === "scale(0)") return;

            if (
              parentElement.offsetWidth +
                parentElement.offsetHeight +
                parentElement.getBoundingClientRect().height +
                parentElement.getBoundingClientRect().width ===
              0
            )
              return;

            const size = style.getPropertyValue("font-size");
            if (size === "0px") return;

            // todo consider more cases, such as outside of viewport, behind other elements, or same/similar color as background

            const weight = style.getPropertyValue("font-weight");
            const childNode: TextNode = {
              type: "text",
              text,
              size,
              weight: weight === "normal" || weight === "400" ? undefined : weight,
            };

            parent.children = parent.children || [];
            parent.children.push(childNode);
          }
        });

        // clear redundant areaPercent
        if (parent.children?.every((c) => c.type !== "element" || c.areaPercent === 0)) {
          parent.children.forEach((c) => c.type === "element" && delete c.areaPercent);
        }
      }
      fillMap(resultMap);

      function simplifyMap(parent: WebNodeWithElement) {
        if (parent.type !== "element") return;

        parent.children?.forEach(simplifyMap);
        // remove children that are empty
        parent.children = parent.children?.filter((c) => c.type !== "element" || c.children?.length);

        // move children up if there is only one
        if (parent.children?.length === 1) {
          const child = parent.children[0]!;
          if (child.type === "element") {
            parent.children = child.children;
          }
        }
      }
      simplifyMap(resultMap);

      const serializableMap: ContainerNode = { ...resultMap };
      delete (serializableMap as Partial<ContainerNodeWithElement>).el;
      function removeElement(src: ContainerNodeWithElement, dst: ContainerNode) {
        dst.children = src.children?.map((c) => {
          if (c.type === "element") {
            const { el, ...rest } = c;
            return removeElement(c, rest);
          } else {
            return c;
          }
        });
        return dst;
      }
      removeElement(resultMap, serializableMap);

      return serializableMap;
    },
    [BLACKLISTED_TAGS],
  );
}

export function getOpenGraphMetadata(page: Page) {
  return page.evaluate(() => {
    const metaTags = Array.from(document.getElementsByTagName("meta"));
    const ogProperties: { [key: string]: string } = {};

    for (let i = 0; i < metaTags.length; i++) {
      const property = metaTags[i]!.getAttribute("property");
      if (property && property.indexOf("og:") === 0) {
        const content = metaTags[i]!.getAttribute("content");
        if (content) ogProperties[property.replace("og:", "")] = content;
      }
    }

    return ogProperties;
  });
}
