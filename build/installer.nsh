; Included automatically by electron-builder's NSIS target.

!include LogicLib.nsh
!include nsDialogs.nsh
!include FileFunc.nsh
!include WordFunc.nsh

!ifndef BUILD_UNINSTALLER
  Var wizardLanguage
  Var resumeAfterLanguagePage
!endif

!ifdef BUILD_UNINSTALLER
  Var removeUserData
  Var uninstallDataChoice
  Var uninstallDataKeep
  Var uninstallProfile
  Var previousRunAsNode
  Var cleanupOutput
  Var cleanupCheckOnly
!endif

!ifndef OPENMATHPIX_DATA_PROFILE
  !define OPENMATHPIX_DATA_PROFILE "$APPDATA\${APP_PACKAGE_NAME}"
!endif

!ifndef BUILD_UNINSTALLER
  Var appLanguage

  ; Sets $appLanguage to the language OpenMathpix already uses (2052 or 1033), read from the
  ; signed-in user's settings, or to "" when it has never run. electron-store writes one
  ; `"key": value` per line. Leaves the current-user shell context: the caller restores it
  ; ($installMode is declared after this file is included).
  Function OpenMathpixAppLanguage
    Push $0
    Push $1
    Push $2
    StrCpy $appLanguage ""
    SetShellVarContext current
    ClearErrors
    FileOpen $0 "${OPENMATHPIX_DATA_PROFILE}\config.json" r
    ${IfNot} ${Errors}
      ${Do}
        ClearErrors
        FileRead $0 $1
        ${If} ${Errors}
          ${ExitDo}
        ${EndIf}
        ClearErrors
        ${WordFind} $1 '"language": "' "E+1}" $2
        ${IfNot} ${Errors}
          StrCpy $1 $2 6
          ${If} $1 == 'zh-CN"'
            StrCpy $appLanguage 2052
          ${Else}
            StrCpy $1 $2 3
            ${If} $1 == 'en"'
              StrCpy $appLanguage 1033
            ${EndIf}
          ${EndIf}
          ${ExitDo}
        ${EndIf}
      ${Loop}
      FileClose $0
    ${EndIf}
    ClearErrors
    Pop $2
    Pop $1
    Pop $0
  FunctionEnd
!endif

; NSIS fixes its language table after .onInit. When the first-page dropdown changes
; language, restart only the wizard (no installation has started). Wait for the old
; process BEFORE electron-builder takes its single-installer mutex, avoiding a race.
!macro preInit
  !ifndef BUILD_UNINSTALLER
    ${GetParameters} $0
    ${GetOptions} $0 "/OPENMATHPIX_PARENT=" $1
    ${IfNot} ${Errors}
      System::Call 'kernel32::OpenProcess(i0x100000, i0, ir1)p.r2'
      ${If} $2 != 0
        System::Call 'kernel32::WaitForSingleObject(pr2, i15000)i.r3'
        System::Call 'kernel32::CloseHandle(pr2)'
        ${If} $3 != 0
          MessageBox MB_OK|MB_ICONSTOP "Please close the previous installer and try again. / 请关闭之前的安装程序后重试。"
          Abort
        ${EndIf}
      ${EndIf}
    ${EndIf}
    ClearErrors
  !endif
!macroend

; The first page offers the language OpenMathpix already uses; on a first installation, the
; Windows display language (including all Chinese locales). The language chosen there is
; also the app's language: an interactive install hands it over in customInstall.
!macro customInit
  ${If} ${UAC_IsInnerInstance}
    ; Keep the user's selection when an all-users install elevates the wizard.
    !insertmacro UAC_AsUser_GetGlobalVar $LANGUAGE
  ${Else}
    Call OpenMathpixAppLanguage
    ${If} $installMode == "all"
      SetShellVarContext all
    ${EndIf}
    ${If} $appLanguage != ""
      StrCpy $LANGUAGE $appLanguage
    ${Else}
      System::Call 'kernel32::GetUserDefaultUILanguage() i .r0'
      IntOp $0 $0 & 0x3ff
      ${If} $0 == 4
        StrCpy $LANGUAGE 2052
      ${Else}
        StrCpy $LANGUAGE 1033
      ${EndIf}
    ${EndIf}
    ${GetParameters} $0
    ${GetOptions} $0 "/OPENMATHPIX_LANGUAGE=" $1
    ${If} $1 == 1033
    ${OrIf} $1 == 2052
      StrCpy $LANGUAGE $1
      StrCpy $resumeAfterLanguagePage 1
    ${EndIf}
    ClearErrors
  ${EndIf}
  StrCpy $wizardLanguage $LANGUAGE
!macroend

; An ordinary wizard page gives the user a language dropdown followed by Next,
; rather than a separate modal language dialog followed by a duplicate welcome page.
!macro customWelcomePage
  Var languageDropdown
  Var languageDescription
  Page custom OpenMathpixLanguagePage OpenMathpixLanguageLeave

  Function OpenMathpixLanguageLeave
    ${If} $LANGUAGE != $wizardLanguage
      ${GetParameters} $0
      System::Call 'kernel32::GetCurrentProcessId()i.r1'
      ; /D is consumed by NSIS and absent from GetParameters; keep it last.
      ClearErrors
      Exec '"$EXEPATH" /OPENMATHPIX_LANGUAGE=$LANGUAGE /OPENMATHPIX_PARENT=$1 $0 /D=$INSTDIR'
      ${If} ${Errors}
        MessageBox MB_OK|MB_ICONSTOP "Could not change the setup language. Please try again. / 无法切换安装语言，请重试。"
        Abort
      ${EndIf}
      Quit
    ${EndIf}
  FunctionEnd

  Function OpenMathpixLanguageChanged
    Pop $0
    ${NSD_GetText} $languageDropdown $0
    ${If} $0 == "简体中文"
      StrCpy $LANGUAGE 2052
    ${Else}
      StrCpy $LANGUAGE 1033
    ${EndIf}
    Call OpenMathpixRefreshLanguage
  FunctionEnd

  Function OpenMathpixRefreshLanguage
    ${If} $LANGUAGE == 2052
      !insertmacro MUI_HEADER_TEXT "欢迎安装 OpenMathpix" "选择安装语言，然后点击下一步继续。"
      ${NSD_SetText} $languageDescription "安装程序和 OpenMathpix 都将使用下方选择的语言。安装后也可以在 OpenMathpix 的设置中更改。"
      SendMessage $HWNDPARENT ${WM_SETTEXT} 0 "STR:OpenMathpix 安装"
      GetDlgItem $0 $HWNDPARENT 1
      SendMessage $0 ${WM_SETTEXT} 0 "STR:下一步(&N) >"
      GetDlgItem $0 $HWNDPARENT 2
      SendMessage $0 ${WM_SETTEXT} 0 "STR:取消"
    ${Else}
      !insertmacro MUI_HEADER_TEXT "Welcome to OpenMathpix Setup" "Choose your language, then click Next to continue."
      ${NSD_SetText} $languageDescription "Setup and OpenMathpix will both use the language selected below. You can change the app's language later in its Settings."
      SendMessage $HWNDPARENT ${WM_SETTEXT} 0 "STR:OpenMathpix Setup"
      GetDlgItem $0 $HWNDPARENT 1
      SendMessage $0 ${WM_SETTEXT} 0 "STR:&Next >"
      GetDlgItem $0 $HWNDPARENT 2
      SendMessage $0 ${WM_SETTEXT} 0 "STR:Cancel"
    ${EndIf}
  FunctionEnd

  Function OpenMathpixLanguagePage
    ${If} ${UAC_IsInnerInstance}
      Abort
    ${EndIf}
    ${If} $resumeAfterLanguagePage == 1
      StrCpy $resumeAfterLanguagePage 0
      Abort
    ${EndIf}
    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}
    ${NSD_CreateLabel} 0 12u 100% 36u ""
    Pop $languageDescription
    ${NSD_CreateLabel} 0 64u 100% 12u "Language / 语言"
    Pop $0
    ${NSD_CreateDropList} 0 82u 75% 80u ""
    Pop $languageDropdown
    ${NSD_CB_AddString} $languageDropdown "English"
    ${NSD_CB_AddString} $languageDropdown "简体中文"
    ${If} $LANGUAGE == 2052
      ${NSD_CB_SelectString} $languageDropdown "简体中文"
    ${Else}
      ${NSD_CB_SelectString} $languageDropdown "English"
    ${EndIf}
    ${NSD_OnChange} $languageDropdown OpenMathpixLanguageChanged
    Call OpenMathpixRefreshLanguage
    nsDialogs::Show
  FunctionEnd
!macroend

!macro customInstall
  WriteRegDWORD SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" "InstallerLanguage" $LANGUAGE
  ; Hand the first page's choice to OpenMathpix, which applies it once at its next start
  ; (src/main/installer-language.ts). Silent installs, such as in-app updates, choose no
  ; language and must not override one picked in the app.
  Delete "$INSTDIR\resources\installer-language"
  ${IfNot} ${Silent}
    ${If} $LANGUAGE == 2052
      StrCpy $0 "zh-CN"
    ${Else}
      StrCpy $0 "en"
    ${EndIf}
    ; A stamp unique to this installation, so a repeat install is applied again.
    System::Call 'kernel32::GetSystemTimeAsFileTime(*l .r1)'
    ClearErrors
    FileOpen $2 "$INSTDIR\resources\installer-language" w
    ${IfNot} ${Errors}
      FileWrite $2 "$0$\r$\n$1$\r$\n"
      FileClose $2
    ${EndIf}
    ClearErrors
  ${EndIf}
!macroend

; Let the application's normal quit flow flush edits, stop workers and release files.
; A cancelled quit must never be replaced by taskkill/Stop-Process during setup.
!macro customCheckAppRunning
  ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $0
  ${If} $0 == 0
    openmathpix_close_retry:
    ${If} ${UAC_IsInnerInstance}
      !insertmacro UAC_AsUser_ExecShell "open" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "--quit-for-uninstall" "$INSTDIR" SW_HIDE
    ${Else}
      Exec '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --quit-for-uninstall'
    ${EndIf}
    StrCpy $R4 0
    ${Do}
      Sleep 250
      ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $0
      ${If} $0 != 0
        ${ExitDo}
      ${EndIf}
      IntOp $R4 $R4 + 1
    ${LoopUntil} $R4 >= 40
    ${If} $0 == 0
      ${If} $LANGUAGE == 2052
        MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "OpenMathpix 仍在运行。请完成应用内的退出确认，或从托盘菜单选择 Exit，再重试。取消会停止安装或卸载，不会强制终止应用。" IDRETRY openmathpix_close_retry
      ${Else}
        MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "OpenMathpix is still running. Complete its exit confirmation, or choose Exit from the tray menu, then retry. Cancel stops setup without forcing the application to close." IDRETRY openmathpix_close_retry
      ${EndIf}
      Quit
    ${EndIf}
  ${EndIf}
!macroend

!macro customUnInit
  ; Electron-builder's legacy flag deletes profiles independently of our choice. Disable
  ; that code path, including during updates: this wizard is the only deletion authority.
  ${WordReplace} "$CMDLINE" "--delete-app-data" "--openmathpix-data-choice" "+" $CMDLINE
  StrCpy $removeUserData 0
  ${IfNot} ${isUpdated}
    ; Even an explicit /S uninstall asks. Upgrade/reinstall paths remain silent and
    ; always preserve user data, regardless of a previous uninstall choice.
    ; For an all-users install the wizard (and this page) runs in the elevated copy.
    SetSilent normal
    ReadRegDWORD $0 SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" "InstallerLanguage"
    ${If} $0 == 1033
    ${OrIf} $0 == 2052
      StrCpy $LANGUAGE $0
    ${Else}
      System::Call 'kernel32::GetUserDefaultUILanguage()i.r0'
      IntOp $0 $0 & 0x3ff
      ${If} $0 == 4
        StrCpy $LANGUAGE 2052
      ${Else}
        StrCpy $LANGUAGE 1033
      ${EndIf}
    ${EndIf}
  ${EndIf}
  SetShellVarContext current
  StrCpy $uninstallProfile "${OPENMATHPIX_DATA_PROFILE}"
  ${If} $installMode == "all"
    SetShellVarContext all
  ${EndIf}
!macroend

!macro customUnWelcomePage
  UninstPage custom un.OpenMathpixDataPage un.OpenMathpixDataLeave

  Function un.OpenMathpixDataPage
    ${If} ${isUpdated}
      Abort
    ${EndIf}
    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      MessageBox MB_OK|MB_ICONSTOP "Could not show the data removal options. / 无法显示数据保留选项。"
      Quit
    ${EndIf}
    ${If} $LANGUAGE == 2052
      !insertmacro MUI_HEADER_TEXT "卸载 OpenMathpix" "是否同时删除您的 OpenMathpix 数据？"
      ${NSD_CreateLabel} 0 0 100% 12u "OpenMathpix 程序将被移除。请选择如何处理您的个人数据："
      Pop $0
      ${NSD_CreateRadioButton} 0 18u 100% 12u "保留我的数据"
      Pop $uninstallDataKeep
      ${NSD_CreateLabel} 12u 31u 96% 26u "保留截图识别历史、已保存的 API Key、设置和已下载的模型。以后重新安装时可直接继续使用。"
      Pop $0
      ${NSD_CreateRadioButton} 0 62u 100% 12u "删除我的所有数据"
      Pop $uninstallDataChoice
      ${NSD_CreateLabel} 12u 75u 96% 60u "永久删除截图识别历史、已保存的 API Key、所有设置，以及 OpenMathpix 下载的全部模型（MFR-1.5、TexTeller，包括存放在自定义位置的模型）。通过“导入已有模型”使用的外部模型文件夹不会被删除。此操作无法撤销。"
      Pop $0
    ${Else}
      !insertmacro MUI_HEADER_TEXT "Uninstall OpenMathpix" "Do you also want to delete your OpenMathpix data?"
      ${NSD_CreateLabel} 0 0 100% 12u "OpenMathpix will be removed. Choose what happens to your personal data:"
      Pop $0
      ${NSD_CreateRadioButton} 0 18u 100% 12u "Keep my data"
      Pop $uninstallDataKeep
      ${NSD_CreateLabel} 12u 31u 96% 26u "Keep your snip history, saved API key, settings and downloaded models, so a future installation can continue where you left off."
      Pop $0
      ${NSD_CreateRadioButton} 0 62u 100% 12u "Delete all my data"
      Pop $uninstallDataChoice
      ${NSD_CreateLabel} 12u 75u 96% 60u "Permanently delete your snip history, saved API key, all settings and every model OpenMathpix downloaded (MFR-1.5 and TexTeller, including custom storage locations). Model folders you added with Import Existing Model are not touched. This cannot be undone."
      Pop $0
    ${EndIf}
    ${If} $removeUserData == 1
      ${NSD_Check} $uninstallDataChoice
    ${Else}
      ${NSD_Check} $uninstallDataKeep
    ${EndIf}
    ; The next page removes the program immediately, so name the action on the button.
    GetDlgItem $0 $HWNDPARENT 1
    ${If} $LANGUAGE == 2052
      SendMessage $0 ${WM_SETTEXT} 0 "STR:卸载(&U)"
    ${Else}
      SendMessage $0 ${WM_SETTEXT} 0 "STR:&Uninstall"
    ${EndIf}
    nsDialogs::Show
  FunctionEnd

  Function un.OpenMathpixDataLeave
    ${NSD_GetState} $uninstallDataChoice $removeUserData
  FunctionEnd

  Function un.OpenMathpixSetCheckMode
    StrCpy $cleanupCheckOnly $R5
  FunctionEnd

  Function un.OpenMathpixRemoveData
    ; Resolve the profile here, as the signed-in user: an elevated uninstaller calls this
    ; through UAC_AsUser_Call, and the user-side copy does not share its variables.
    SetShellVarContext current
    StrCpy $uninstallProfile "${OPENMATHPIX_DATA_PROFILE}"
    ReadEnvStr $previousRunAsNode "ELECTRON_RUN_AS_NODE"
    System::Call 'kernel32::SetEnvironmentVariable(t "ELECTRON_RUN_AS_NODE", t "1")'
    ${If} $cleanupCheckOnly == 1
      nsExec::ExecToStack /TIMEOUT=60000 '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "$INSTDIR\resources\app.asar\out\main\uninstall-data.js" --check-keep-data "$uninstallProfile" "$INSTDIR"'
    ${Else}
      nsExec::ExecToStack /TIMEOUT=60000 '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "$INSTDIR\resources\app.asar\out\main\uninstall-data.js" "$uninstallProfile"'
    ${EndIf}
    Pop $0
    Pop $1
    StrCpy $cleanupOutput $1
    ${If} $previousRunAsNode == ""
      System::Call 'kernel32::SetEnvironmentVariable(t "ELECTRON_RUN_AS_NODE", p0)'
    ${Else}
      System::Call 'kernel32::SetEnvironmentVariable(t "ELECTRON_RUN_AS_NODE", t "$previousRunAsNode")'
    ${EndIf}
    ; An uninstaller started elevated directly calls this itself; the rest of an
    ; all-users uninstall (shortcuts, registry) must keep using the all-users context.
    ${If} $installMode == "all"
      SetShellVarContext all
    ${EndIf}
  FunctionEnd

  ; Per-user state outside the profile: the updater caches and the sign-in entry
  ; (Settings > General > Start at sign-in) with its Task Manager on/off state.
  Function un.OpenMathpixRemoveUserState
    SetShellVarContext current
    RMDir /r "$LOCALAPPDATA\${APP_PACKAGE_NAME}-updater"
    RMDir /r "$TEMP\${APP_PACKAGE_NAME}-update"
    ; Electron names the entry after app.getName(), i.e. the package name.
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${APP_PACKAGE_NAME}"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "${APP_PACKAGE_NAME}"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${PRODUCT_NAME}"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "${PRODUCT_NAME}"
    ${If} $installMode == "all"
      SetShellVarContext all
    ${EndIf}
  FunctionEnd
!macroend

!macro customUnInstall
  ; The installer keeps a copy of itself for electron-updater, which OpenMathpix does not
  ; use. Remove the ~140 MB cache on a real uninstall, but not while upgrading in place.
    StrCpy $cleanupCheckOnly 1
    ${IfNot} ${isUpdated}
      ${If} $removeUserData == 1
        StrCpy $cleanupCheckOnly 0
      ${EndIf}
    ${EndIf}
      openmathpix_cleanup_retry:
      ${If} ${UAC_IsInnerInstance}
        ; Clean the original user's profile as that user, even with different admin credentials.
        ; User globals are not synced by the plugin; carry this flag via a register.
        StrCpy $R5 $cleanupCheckOnly
        !insertmacro UAC_AsUser_Call Function un.OpenMathpixSetCheckMode ${UAC_SYNCREGISTERS}
        !insertmacro UAC_AsUser_Call Function un.OpenMathpixRemoveData ${UAC_SYNCREGISTERS}|${UAC_SYNCINSTDIR}
        StrCpy $cleanupOutput $1
      ${Else}
        Call un.OpenMathpixRemoveData
      ${EndIf}
      ${If} $0 != 0
        ${If} $cleanupCheckOnly == 1
          ${If} $LANGUAGE == 2052
            MessageBox MB_RETRYCANCEL|MB_ICONSTOP "无法保证数据安全保留，因此已停止卸载或升级。请查看原因，将模型移到安装目录外并在设置中更新路径，然后重试。若要彻底删除应用数据，可取消后重新卸载，并选择“删除我的所有数据”。$\r$\n$\r$\n$cleanupOutput" IDRETRY openmathpix_cleanup_retry
          ${Else}
            MessageBox MB_RETRYCANCEL|MB_ICONSTOP "Setup stopped because it could not safely preserve your data. Move models outside the installation folder and update Settings, then retry. To remove application data instead, cancel and start uninstall again with Delete all my data.$\r$\n$\r$\n$cleanupOutput" IDRETRY openmathpix_cleanup_retry
          ${EndIf}
        ${ElseIf} $LANGUAGE == 2052
          MessageBox MB_RETRYCANCEL|MB_ICONSTOP "部分应用数据无法删除。请连接模型所在的磁盘并关闭正在使用这些文件的程序，再重试。取消将保留应用；您也可以重新卸载并选择“保留我的数据”。$\r$\n$\r$\n$cleanupOutput" IDRETRY openmathpix_cleanup_retry
        ${Else}
          MessageBox MB_RETRYCANCEL|MB_ICONSTOP "Some application data could not be removed. Reconnect model drives and close programs using the files, then retry. Cancel keeps the application installed; you can uninstall again and choose Keep my data.$\r$\n$\r$\n$cleanupOutput" IDRETRY openmathpix_cleanup_retry
        ${EndIf}
        Abort
      ${EndIf}
  ${ifNot} ${isUpdated}
    ${If} ${UAC_IsInnerInstance}
      !insertmacro UAC_AsUser_Call Function un.OpenMathpixRemoveUserState ${UAC_SYNCREGISTERS}
    ${Else}
      Call un.OpenMathpixRemoveUserState
    ${EndIf}
  ${endIf}
!macroend
