import * as Headless from '@headlessui/react'
import React, { createContext, forwardRef, useContext } from 'react'

/**
 * Catalyst's Link is meant to be swapped for the app's router link. This one stays a plain <a> and
 * asks the app to change the page itself (no reload) when a LinkNavigation is set up around it.
 */
export interface Navigation {
  navigate: (href: string) => void
  /** Ctrl/Cmd/Shift/middle click opens the link in a new tab or window as usual. */
  newTabs: boolean
}

const NavigationContext = createContext<Navigation | null>(null)
export const LinkNavigation = NavigationContext.Provider

export const Link = forwardRef(function Link(
  props: { href: string } & React.ComponentPropsWithoutRef<'a'>,
  ref: React.ForwardedRef<HTMLAnchorElement>
) {
  const navigation = useContext(NavigationContext)
  return (
    <Headless.DataInteractive>
      <a
        {...props}
        ref={ref}
        onClick={(event) => {
          props.onClick?.(event)
          if (!navigation || event.defaultPrevented || props.target) return
          const special = event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
          if (special && navigation.newTabs) return
          event.preventDefault()
          navigation.navigate(props.href)
        }}
      />
    </Headless.DataInteractive>
  )
})
