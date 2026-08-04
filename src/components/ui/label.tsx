import { Field } from "@base-ui/react/field"

import { cn } from "@/lib/utils"

function Label({ className, ...props }: Field.Label.Props) {
  return (
    <Field.Label
      data-slot="label"
      className={cn(
        "text-sm font-medium leading-none select-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
        className
      )}
      {...props}
    />
  )
}

export { Label }
