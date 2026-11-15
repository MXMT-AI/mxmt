import { Heading } from "../heading/heading";
import { Text } from "../text/text";

export function ItemDescription({ title, description }: {
  title: string;
  description: string;
}) {
  return (
    <>
      <Heading as="h3" variant="item">{title}</Heading>
      <Text variant="description">{description}</Text>
    </>
  );
}
