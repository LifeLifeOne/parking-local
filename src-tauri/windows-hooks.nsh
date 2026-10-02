!macro NSIS_HOOK_POSTINSTALL
  CreateShortcut "$DESKTOP\Parking local.lnk" "$INSTDIR\parking-local.exe"
!macroend
!macro NSIS_HOOK_PREUNINSTALL
  Delete "$DESKTOP\Parking local.lnk"
!macroend
