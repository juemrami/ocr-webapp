import * as PopoverPrimitives from "@kobalte/core/popover"
import type { ComponentProps } from "solid-js"
import { splitProps } from "solid-js"

function Popover(props: ComponentProps<typeof PopoverPrimitives.Root>) {
	return <PopoverPrimitives.Root data-slot="popover" {...props} />
}

function PopoverTrigger(props: ComponentProps<typeof PopoverPrimitives.Trigger>) {
	return <PopoverPrimitives.Trigger data-slot="popover-trigger" {...props} />
}

function PopoverContent(props: ComponentProps<typeof PopoverPrimitives.Content>) {
	const [local, rest] = splitProps(props, ["class"])
	const cls = local.class || ""
	return (
		<PopoverPrimitives.Portal>
			<PopoverPrimitives.Content
				data-slot="popover-content"
				class={"base-popover" + cls}
				{...rest}
			/>
		</PopoverPrimitives.Portal>
	)
}

function PopoverAnchor(props: ComponentProps<typeof PopoverPrimitives.Anchor>) {
	return <PopoverPrimitives.Anchor data-slot="popover-anchor" {...props} />
}

export { Popover, PopoverAnchor, PopoverContent, PopoverTrigger }
