# Custom NSIS steps, picked up by electron-builder from build/installer.nsh.

# The installer removes the old version before it unpacks the new one, so on a full disk it used
# to leave no app at all. Check the space first, while the old version is still there: the app
# files go to the install drive, and the installer's archive is copied to the temp folder first.
# Needs (in MB, plus 200 MB to spare): the unpacked app on the install drive, the installer's size
# on the temp drive, both together when they are the same drive.
!macro customInit
  Push $R0
  Push $R1
  Push $R2
  Push $R3
  Push $R4
  Push $R5

  StrCpy $R0 $INSTDIR 3
  StrCpy $R1 $TEMP 3
  FileOpen $R2 $EXEPATH r
  FileSeek $R2 0 END $R3
  FileClose $R2
  IntOp $R3 $R3 / 1048576
  IntOp $R3 $R3 + 1
  IntOp $R4 ${APP_64_UNPACKED_SIZE} / 1024
  IntOp $R4 $R4 + 200

  # $R2: the drive that lacks space, empty when there is enough everywhere.
  StrCpy $R2 ""
  ${If} $R0 == $R1
    IntOp $R4 $R4 + $R3
  ${Else}
    IntOp $R3 $R3 + 200
    ClearErrors
    ${DriveSpace} $R1 "/D=F /S=M" $R5
    ${IfNot} ${Errors}
    ${AndIf} $R5 < $R3
      StrCpy $R2 $R1
      IntOp $R4 $R3 - $R5
    ${EndIf}
  ${EndIf}
  ${If} $R2 == ""
    # An install folder on a drive that can't be read (a network path) is left to the installer.
    ClearErrors
    ${DriveSpace} $R0 "/D=F /S=M" $R5
    ${IfNot} ${Errors}
    ${AndIf} $R5 < $R4
      StrCpy $R2 $R0
      IntOp $R4 $R4 - $R5
    ${EndIf}
  ${EndIf}

  ${If} $R2 != ""
    StrCpy $R2 $R2 2
    ${If} $LANGUAGE == 1058
      MessageBox MB_OK|MB_ICONSTOP "Замало місця на диску $R2, щоб установити ${PRODUCT_NAME} ${VERSION}.$\r$\n$\r$\nЗвільніть щонайменше $R4 МБ і запустіть інсталятор ще раз. Встановлена програма та ваші дошки залишаються без змін." /SD IDOK
    ${Else}
      MessageBox MB_OK|MB_ICONSTOP "Not enough space on drive $R2 to install ${PRODUCT_NAME} ${VERSION}.$\r$\n$\r$\nFree up at least $R4 MB and run the installer again. The installed app and your boards are left as they are." /SD IDOK
    ${EndIf}
    # A silent update from the app closed it to install: start the old version again.
    ${If} ${Silent}
    ${AndIf} ${FileExists} "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
      ${GetParameters} $R0
      ClearErrors
      ${GetOptions} $R0 "--force-run" $R1
      ${IfNot} ${Errors}
        Exec '"$INSTDIR\${APP_EXECUTABLE_FILENAME}"'
      ${EndIf}
    ${EndIf}
    # .onInit has already made the install folder (and works in it); drop it again when it is empty.
    SetOutPath $TEMP
    RMDir "$INSTDIR"
    SetErrorLevel 2
    Quit
  ${EndIf}

  Pop $R5
  Pop $R4
  Pop $R3
  Pop $R2
  Pop $R1
  Pop $R0
!macroend
