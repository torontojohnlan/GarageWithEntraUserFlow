Import-Module Microsoft.Graph.Identity.SignIns
Connect-MgGraph -Scopes "Policy.ReadWrite.ApplicationConfiguration", "Policy.Read.All", "Application.ReadWrite.All"

# create a new claim mapping policy
$params = @{
    Definition = @('{
        "ClaimsMappingPolicy": {
            "Version": 1,
            "IncludeBasicClaimSet": "true",
            "ClaimsSchema": [
                {
                    "Source": "user",
                    "ExtensionID": "extension_0091fd941cfb4209be22d8bd3bdade34_deviceID",
                    "JwtClaimType": "deviceID"
                }
            ]
        }
    }')
    DisplayName = "IncludeDeviceID"
}
New-MgPolicyClaimMappingPolicy -Definition $params.Definition -DisplayName $params.DisplayName

# retrieve policy ID
$policyObj = Get-MgPolicyClaimMappingPolicy  | Where-Object {$_.DisplayName -eq 'IncludeDeviceID'} | Select-Object Id
$policyID = $policyObj.Id

# retrieve service principal ID
$servicePrincipal = Get-MgServicePrincipal -Filter "DisplayName eq 'My Garage Remote'"
$servicePrincipalId = $servicePrincipal.Id

# assign the claim mapping policy to the service principal
$params = @{
    "@odata.id" = "https://graph.microsoft.com/v1.0/policies/claimsMappingPolicies/$($policyID)"
}
New-MgServicePrincipalClaimMappingPolicyByRef -ServicePrincipalId $servicePrincipalId -BodyParameter $params