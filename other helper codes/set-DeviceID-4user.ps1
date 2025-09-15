# Install the Microsoft Graph module if not already installed
# Install-Module Microsoft.Graph -Scope CurrentUser

# Connect to Microsoft Graph (Entra ID)
Import-Module Microsoft.Graph.Identity.SignIns
Connect-MgGraph -Scopes "User.ReadWrite.All"

# Set variables
$userid = "b28f89cc-ff2e-495c-b797-e64e78a21e4e" # Object ID of the user
$customAttributeName = "deviceID"
$customAttributeValue = "dummyController"

# Prepare the extension property name (replace {AppId} with your registered app's AppId)
$extensionAppId = "0091fd941cfb4209be22d8bd3bdade34" # e.g., "12345678-90ab-cdef-1234-567890abcdef"
$extensionProperty = "extension_${extensionAppId}_${customAttributeName}"

# Update the user with the custom attribute
Update-MgUser -UserID $userid -AdditionalProperties @{ $extensionProperty = $customAttributeValue }

Write-Host "Custom attribute '$customAttributeName' set to '$customAttributeValue' for user $userPrincipalName."