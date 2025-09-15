Import-Module Microsoft.Graph.Identity.SignIns
Import-Module Microsoft.Graph.Applications
Connect-MgGraph -Scopes "Policy.ReadWrite.ApplicationConfiguration", "Policy.Read.All", "Application.ReadWrite.All"

# retrieve policy ID
$policyObj = Get-MgPolicyClaimMappingPolicy  | Where-Object {$_.DisplayName -eq 'IncludeDeviceID'} | Select-Object Id
$policyID = $policyObj.Id

# retrieve service principal ID
$servicePrincipal = Get-MgServicePrincipal -Filter "DisplayName eq 'My Garage Remote'"
$servicePrincipalId = $servicePrincipal.Id

Remove-MgServicePrincipalClaimMappingPolicyByRef `
  -ServicePrincipalId  $servicePrincipalId `
  -ClaimsMappingPolicyId  $policyID
# this does not remove the policy, just remove the association between service principal and policy

# remove the policy
Remove-MgPolicyClaimMappingPolicy -PolicyId $policyID

# or reattach the policy to another service principal
# Add-MgServicePrincipalClaimMappingPolicy -ServicePrincipalId $servicePrincipalId -ClaimsMappingPolicyId $policyID